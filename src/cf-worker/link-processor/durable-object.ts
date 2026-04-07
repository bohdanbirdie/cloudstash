import { createStoreDoPromise } from "@livestore/adapter-cloudflare";
import type { ClientDoWithRpcCallback } from "@livestore/adapter-cloudflare";
import { computed, nanoid, queryDb } from "@livestore/livestore";
import type { Store, Unsubscribe } from "@livestore/livestore";
import { handleSyncUpdateRpc } from "@livestore/sync-cf/client";
/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import { Effect, Layer } from "effect";

import { schema, tables } from "../../livestore/schema";
import { LinkId, OrgId } from "../db/branded";
import { DbClientLive } from "../db/service";
import { maskId, safeErrorInfo } from "../log-utils";
import { logSync } from "../logger";
import { OrgFeaturesLive } from "../org/features-service";
import type { Env } from "../shared";
import { cancelStaleLinks, ingestLink, notifyResult } from "./do-programs";
import type { NotifyResultParams } from "./do-programs";
import { runEffect } from "./logger";
import { processLink } from "./process-link";
import { FeatureStore } from "./services";
import { AiSummaryGeneratorLive } from "./services/ai-summary-generator.live";
import { ContentExtractorLive } from "./services/content-extractor.live";
import { FeatureStoreLive } from "./services/feature-store.live";
import { LinkEventStoreLive } from "./services/link-event-store.live";
import { LinkRepositoryLive } from "./services/link-repository.live";
import { MetadataFetcherLive } from "./services/metadata-fetcher.live";
import { SourceNotifierLive } from "./services/source-notifier.live";
import { WorkersAiLive } from "./services/workers-ai.live";
import type { LinkQueueMessage } from "./types";

const logger = logSync("LinkProcessorDO");

type Link = typeof tables.links.Type;

export class LinkProcessorDO
  extends DurableObject<Env>
  implements ClientDoWithRpcCallback
{
  override __DURABLE_OBJECT_BRAND = "link-processor-do" as never;

  private storeId: string | undefined;
  private cachedStore: Store<typeof schema> | undefined;
  private storeCreationPromise: Promise<Store<typeof schema>> | undefined;
  private subscription: Unsubscribe | undefined;
  private currentlyProcessing = new Set<string>();
  private notifiedLinkIds = new Set<string>();
  private hasRunCleanup = false;
  private totalRowsWritten = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const origExec = this.ctx.storage.sql.exec.bind(this.ctx.storage.sql);
    this.ctx.storage.sql.exec = ((...args: unknown[]) => {
      const cursor = origExec(args[0] as string, ...args.slice(1));
      this.totalRowsWritten += cursor.rowsWritten;
      return cursor;
    }) as typeof origExec;
  }

  private async getSessionId(): Promise<string> {
    const stored = await this.ctx.storage.get<string>("sessionId");
    if (stored) {
      return stored;
    }

    const newSessionId = nanoid();
    await this.ctx.storage.put("sessionId", newSessionId);
    return newSessionId;
  }

  private async getStore(): Promise<Store<typeof schema>> {
    if (this.cachedStore) {
      return this.cachedStore;
    }

    if (this.storeCreationPromise) {
      return this.storeCreationPromise;
    }

    if (!this.storeId) {
      throw new Error("storeId not set");
    }

    this.storeCreationPromise = this.createStoreInternal();

    try {
      const store = await this.storeCreationPromise;
      return store;
    } catch (error) {
      this.storeCreationPromise = undefined;
      throw error;
    }
  }

  private async createStoreInternal(): Promise<Store<typeof schema>> {
    const sessionId = await this.getSessionId();

    let eventlogRows = 0;
    let maxSeqNum = 0;
    try {
      const hasTable =
        [
          ...this.ctx.storage.sql
            .exec<{ count: number }>(
              "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='eventlog'"
            )
            .toArray(),
        ][0]?.count ?? 0;

      if (hasTable > 0) {
        const stats = [
          ...this.ctx.storage.sql
            .exec<{ rows: number; maxSeq: number }>(
              "SELECT COUNT(*) as rows, COALESCE(MAX(seqNumGlobal), 0) as maxSeq FROM eventlog"
            )
            .toArray(),
        ][0];
        eventlogRows = stats?.rows ?? 0;
        maxSeqNum = stats?.maxSeq ?? 0;
      }
    } catch {
      logger.warn("Failed to read eventlog stats");
    }

    logger.info("Creating store", {
      sessionId: maskId(sessionId),
      storeId: maskId(this.storeId!),
      existingEventlogRows: eventlogRows,
      maxSeqNumGlobal: maxSeqNum,
    });

    this.cachedStore = await createStoreDoPromise({
      clientId: "link-processor-do",
      durableObject: {
        bindingName: "LINK_PROCESSOR_DO",
        ctx: this.ctx,
        env: this.env,
      } as never,
      livePull: true,
      schema,
      sessionId,
      storeId: this.storeId!,
      syncBackendStub: this.env.SYNC_BACKEND_DO.get(
        this.env.SYNC_BACKEND_DO.idFromName(this.storeId!)
      ) as never,
    });

    logger.info("Store created successfully", {
      storeId: maskId(this.storeId!),
    });

    this.storeCreationPromise = undefined;
    return this.cachedStore;
  }

  private buildDoLayer(store: Store<typeof schema>) {
    return Layer.mergeAll(
      LinkRepositoryLive(store),
      SourceNotifierLive(this.env.TELEGRAM_BOT_TOKEN)
    );
  }

  private async ensureSubscribed(): Promise<void> {
    if (this.subscription) {
      return;
    }

    const store = await this.getStore();

    const links$ = queryDb(tables.links.where({ deletedAt: null }));
    const statuses$ = queryDb(tables.linkProcessingStatus.where({}));

    const pendingLinks$ = computed(
      (get) => {
        const links = get(links$);
        const statuses = get(statuses$);
        const statusMap = new Map(statuses.map((s) => [s.linkId, s]));

        return links.filter((link) => {
          const status = statusMap.get(link.id);
          return (
            !status ||
            status.status === "pending" ||
            status.status === "reprocess-requested"
          );
        });
      },
      { label: "pendingLinks" }
    );

    this.subscription = store.subscribe(pendingLinks$, (pendingLinks) => {
      logger.info("Subscription fired", {
        pendingCount: pendingLinks.length,
        pendingLinkIds: pendingLinks.map((l) => l.id).slice(0, 5),
      });
      this.onPendingLinksChanged(store, pendingLinks);
    });

    const summaries$ = queryDb(tables.linkSummaries.where({}));
    const tagSuggestions$ = queryDb(tables.tagSuggestions.where({}));

    const unnotifiedResults$ = computed(
      (get) => {
        const allStatuses = get(statuses$);
        const allLinks = get(links$);
        const allSummaries = get(summaries$);
        const allTagSuggestions = get(tagSuggestions$);
        const linkMap = new Map(allLinks.map((l) => [l.id, l]));
        const summaryMap = new Map(
          allSummaries.map((s) => [s.linkId, s.summary])
        );
        const tagsMap = new Map<string, string[]>();
        for (const ts of allTagSuggestions) {
          const existing = tagsMap.get(ts.linkId) ?? [];
          existing.push(ts.suggestedName);
          tagsMap.set(ts.linkId, existing);
        }

        return allStatuses
          .filter((s) => {
            if (s.notified) return false;
            if (s.status !== "completed" && s.status !== "failed") return false;
            const link = linkMap.get(s.linkId);
            return link?.source != null && link.source !== "app";
          })
          .map((s) => {
            const link = linkMap.get(s.linkId)!;
            return {
              linkId: LinkId.make(s.linkId),
              processingStatus: s.status as "completed" | "failed",
              source: link.source!,
              sourceMeta: link.sourceMeta,
              summary: summaryMap.get(s.linkId) ?? null,
              suggestedTags: tagsMap.get(s.linkId) ?? [],
            };
          });
      },
      { label: "unnotifiedResults" }
    );

    store.subscribe(unnotifiedResults$, (results) => {
      if (results.length === 0) return;
      const newResults = results.filter(
        (r) => !this.notifiedLinkIds.has(r.linkId)
      );
      if (newResults.length === 0) return;
      for (const r of newResults) {
        this.notifiedLinkIds.add(r.linkId);
      }
      this.notifyResults(store, newResults);
    });

    if (!this.hasRunCleanup) {
      this.hasRunCleanup = true;
      runEffect(
        cancelStaleLinks(this.currentlyProcessing, Date.now()).pipe(
          Effect.provide(this.buildDoLayer(store))
        )
      ).catch((error) => {
        logger.error("cancelStaleLinks failed", safeErrorInfo(error));
      });
    }
  }

  private onPendingLinksChanged(
    store: Store<typeof schema>,
    pendingLinks: readonly Link[]
  ): void {
    if (this.currentlyProcessing.size > 0) {
      logger.debug("Skipping, already processing", {
        currentIds: [...this.currentlyProcessing],
        pendingCount: pendingLinks.length,
      });
      return;
    }

    this.processNextPending(store);
  }

  private processNextPending(store: Store<typeof schema>): void {
    if (this.currentlyProcessing.size > 0) return;

    const links = store.query(queryDb(tables.links.where({ deletedAt: null })));
    const statuses = store.query(
      queryDb(tables.linkProcessingStatus.where({}))
    );
    const statusMap = new Map(statuses.map((s) => [s.linkId, s]));

    const nextLink = links.find((link) => {
      const status = statusMap.get(link.id);
      return (
        !status ||
        status.status === "pending" ||
        status.status === "reprocess-requested"
      );
    });

    if (!nextLink) return;

    const existingStatus = statusMap.get(nextLink.id);
    const isReprocess = existingStatus?.status === "reprocess-requested";

    logger.info("Processing link decision", {
      linkId: nextLink.id,
      status: existingStatus?.status ?? "none",
      isReprocess,
    });

    this.processLinkAsync(store, nextLink, isReprocess).catch((error) => {
      logger.error("processLinkAsync error", {
        ...safeErrorInfo(error),
        linkId: nextLink.id,
      });
    });
  }

  private async processLinkAsync(
    store: Store<typeof schema>,
    link: Link,
    isReprocess: boolean
  ): Promise<void> {
    this.currentlyProcessing.add(link.id);

    logger.info("Processing", { isReprocess, linkId: link.id });

    try {
      const rowsBefore = this.totalRowsWritten;
      const features = await Effect.runPromise(
        FeatureStore.pipe(
          Effect.flatMap((fs) => fs.getFeatures(OrgId.make(this.storeId!))),
          Effect.provide(
            FeatureStoreLive.pipe(
              Layer.provide(OrgFeaturesLive),
              Layer.provide(DbClientLive(this.env.DB))
            )
          )
        )
      ).catch(() => ({}));

      const liveLayer = Layer.mergeAll(
        MetadataFetcherLive,
        ContentExtractorLive,
        AiSummaryGeneratorLive,
        LinkEventStoreLive(store)
      ).pipe(Layer.provide(WorkersAiLive(this.env.AI)));

      await runEffect(
        processLink({
          aiSummaryEnabled:
            (features as { aiSummary?: boolean }).aiSummary ?? false,
          link: { id: LinkId.make(link.id), url: link.url },
        }).pipe(Effect.provide(liveLayer))
      );
      logger.info("Link processed", {
        linkId: link.id,
        rowsWritten: this.totalRowsWritten - rowsBefore,
        totalRowsWritten: this.totalRowsWritten,
      });
    } catch (error) {
      logger.error("processLinkAsync failed (store likely dead)", {
        ...safeErrorInfo(error),
        linkId: link.id,
      });
      this.cachedStore = undefined;
      this.storeCreationPromise = undefined;
      this.subscription = undefined;
    } finally {
      this.currentlyProcessing.delete(link.id);
      if (this.cachedStore) {
        this.processNextPending(store);
      }
    }
  }

  private notifyResults(
    store: Store<typeof schema>,
    results: ReadonlyArray<NotifyResultParams>
  ): void {
    const doLayer = this.buildDoLayer(store);
    for (const result of results) {
      runEffect(notifyResult(result).pipe(Effect.provide(doLayer))).catch(
        (error) => {
          logger.error("notifyResult effect failed", {
            ...safeErrorInfo(error),
            linkId: result.linkId,
          });
        }
      );
    }
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const storeId = url.searchParams.get("storeId");

    if (!storeId) {
      return new Response("Missing storeId", { status: 400 });
    }

    logger.info("fetch called (triggerLinkProcessor)", {
      hadCachedStore: !!this.cachedStore,
      hadSubscription: !!this.subscription,
      storeId: maskId(storeId),
    });

    this.storeId = storeId;
    await this.ctx.storage.put("storeId", storeId);

    await this.ensureSubscribed();
    return new Response("OK");
  }

  async ingestAndProcess(
    msg: LinkQueueMessage
  ): Promise<{ status: string; linkId?: string }> {
    logger.info("ingestAndProcess called", {
      source: msg.source,
      storeId: maskId(msg.storeId),
      url: msg.url,
      hadCachedStore: !!this.cachedStore,
      hadSubscription: !!this.subscription,
    });

    this.storeId = msg.storeId;
    await this.ctx.storage.put("storeId", msg.storeId);

    const store = await this.getStore();
    await this.ensureSubscribed();

    const doLayer = this.buildDoLayer(store);
    const result = await runEffect(
      ingestLink({
        url: msg.url,
        storeId: msg.storeId,
        source: msg.source,
        sourceMeta: msg.sourceMeta,
      }).pipe(Effect.provide(doLayer))
    );

    logger.info("ingestAndProcess completed", {
      status: result.status,
      linkId: result.linkId,
      totalRowsWritten: this.totalRowsWritten,
    });

    return result;
  }

  async syncUpdateRpc(payload: unknown): Promise<void> {
    logger.debug("syncUpdateRpc called", {
      hadCachedStore: !!this.cachedStore,
      hadSubscription: !!this.subscription,
      hadStoreId: !!this.storeId,
    });

    if (!this.storeId) {
      this.storeId = await this.ctx.storage.get<string>("storeId");
    }

    if (this.storeId) {
      await this.ensureSubscribed();
    }

    await handleSyncUpdateRpc(payload);

    if (this.cachedStore && this.currentlyProcessing.size === 0) {
      this.processNextPending(this.cachedStore);
    }
  }
}
