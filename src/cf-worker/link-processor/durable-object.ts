import { createStoreDoPromise } from "@livestore/adapter-cloudflare";
import type { ClientDoWithRpcCallback } from "@livestore/adapter-cloudflare";
import { computed, nanoid, queryDb } from "@livestore/livestore";
import type { Store, Unsubscribe } from "@livestore/livestore";
import { handleSyncUpdateRpc } from "@livestore/sync-cf/client";
/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import { Effect, Layer } from "effect";

import { events, schema, tables } from "../../livestore/schema";
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
import { FeatureStore, SourceNotifier } from "./services";
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

const MAX_CONCURRENT_LINKS = 5;
const MAX_NOTIFIED_LINK_IDS = 500;

import {
  evictOldestFromSet,
  getProgressDraftText,
  parseMeta,
} from "./progress-draft";

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
  private submittedLinks = new Set<string>();
  private semaphore = Effect.unsafeMakeSemaphore(MAX_CONCURRENT_LINKS);
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

    // TODO: likely all thise custom SQL should be deleted, it's might be a leftover from our issue previous week, history is in git
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
      const newLinks = pendingLinks.filter(
        (l) => !this.submittedLinks.has(l.id)
      );
      if (newLinks.length === 0) return;

      logger.info("Subscription fired", {
        newCount: newLinks.length,
        totalPending: pendingLinks.length,
      });

      for (const link of newLinks) {
        this.submittedLinks.add(link.id);
      }

      const statuses = store.query(
        queryDb(tables.linkProcessingStatus.where({}))
      );
      const statusMap = new Map(statuses.map((s) => [s.linkId, s]));

      void runEffect(
        Effect.forEach(
          newLinks,
          (link) => {
            const isReprocess =
              statusMap.get(link.id)?.status === "reprocess-requested";
            return this.processLinkEffect(store, link, isReprocess).pipe(
              this.semaphore.withPermits(1),
              Effect.ensuring(
                Effect.sync(() => this.submittedLinks.delete(link.id))
              )
            );
          },
          { concurrency: "unbounded", discard: true }
        )
      );
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
      evictOldestFromSet(this.notifiedLinkIds, MAX_NOTIFIED_LINK_IDS);
      this.notifyResults(store, newResults);
    });

    if (!this.hasRunCleanup) {
      this.hasRunCleanup = true;
      runEffect(
        cancelStaleLinks(this.submittedLinks, Date.now()).pipe(
          Effect.tap((cancelledLinks) => {
            const telegramLinks = cancelledLinks.filter(
              (cl) => cl.source === "telegram"
            );
            const seen = new Set<number>();
            const unique = telegramLinks.filter((cl) => {
              const meta = parseMeta(cl.sourceMeta);
              if (!meta || seen.has(meta.chatId)) return false;
              seen.add(meta.chatId);
              return true;
            });
            return Effect.gen(function* () {
              const notifier = yield* SourceNotifier;
              yield* Effect.forEach(
                unique,
                (cl) =>
                  notifier.reply(
                    { source: "telegram", sourceMeta: cl.sourceMeta },
                    "Processing was interrupted. Please resend the link."
                  ),
                { discard: true }
              );
            });
          }),
          Effect.provide(this.buildDoLayer(store))
        )
      ).catch((error) => {
        logger.error("cancelStaleLinks failed", safeErrorInfo(error));
      });
    }
  }

  private processLinkEffect(
    store: Store<typeof schema>,
    link: Link,
    isReprocess: boolean
  ): Effect.Effect<void> {
    return Effect.gen(this, function* () {
      yield* Effect.logInfo("Processing link").pipe(
        Effect.annotateLogs({
          linkId: link.id,
          isReprocess,
        })
      );

      store.commit(
        events.linkProcessingStarted({
          linkId: link.id,
          updatedAt: new Date(),
        })
      );

      if (link.source === "telegram") {
        this.sendProgressDraft(store, link.sourceMeta);
      }

      const rowsBefore = this.totalRowsWritten;

      const features = yield* FeatureStore.pipe(
        Effect.flatMap((fs) => fs.getFeatures(OrgId.make(this.storeId!))),
        Effect.provide(
          FeatureStoreLive.pipe(
            Layer.provide(OrgFeaturesLive),
            Layer.provide(DbClientLive(this.env.DB))
          )
        ),
        Effect.catchAllDefect(() => Effect.succeed({}))
      );

      const liveLayer = Layer.mergeAll(
        MetadataFetcherLive,
        ContentExtractorLive,
        AiSummaryGeneratorLive,
        LinkEventStoreLive(store)
      ).pipe(Layer.provide(WorkersAiLive(this.env.AI)));

      yield* processLink({
        aiSummaryEnabled:
          (features as { aiSummary?: boolean }).aiSummary ?? false,
        link: { id: LinkId.make(link.id), url: link.url },
        skipStartedEvent: true,
      }).pipe(Effect.provide(liveLayer));

      yield* Effect.logInfo("Link processed").pipe(
        Effect.annotateLogs({
          linkId: link.id,
          rowsWritten: this.totalRowsWritten - rowsBefore,
          totalRowsWritten: this.totalRowsWritten,
        })
      );
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (link.source === "telegram") {
            this.sendProgressDraft(store, link.sourceMeta);
          }
        })
      ),
      Effect.catchAllDefect((defect) =>
        Effect.logError("processLinkEffect failed (store likely dead)").pipe(
          Effect.annotateLogs({
            ...safeErrorInfo(defect),
            linkId: link.id,
          }),
          Effect.tap(() =>
            Effect.sync(() => {
              this.cachedStore = undefined;
              this.storeCreationPromise = undefined;
              this.subscription = undefined;
            })
          )
        )
      ),
      Effect.withSpan("LinkProcessorDO.processLinkEffect", {
        attributes: { linkId: link.id, isReprocess },
      })
    );
  }

  private sendProgressDraft(
    store: Store<typeof schema>,
    sourceMeta: string | null
  ): void {
    const text = getProgressDraftText(store, sourceMeta);
    if (!text) return;

    const doLayer = SourceNotifierLive(this.env.TELEGRAM_BOT_TOKEN);
    runEffect(
      Effect.gen(function* () {
        const notifier = yield* SourceNotifier;
        yield* notifier.streamProgress(
          { source: "telegram", sourceMeta },
          text
        );
      }).pipe(
        Effect.withSpan("LinkProcessorDO.sendProgressDraft"),
        Effect.catchAll((error) =>
          Effect.logWarning("sendProgressDraft failed").pipe(
            Effect.annotateLogs(safeErrorInfo(error))
          )
        ),
        Effect.provide(doLayer)
      )
    ).catch(() => {});
  }

  private notifyResults(
    store: Store<typeof schema>,
    results: ReadonlyArray<NotifyResultParams>
  ): void {
    const doLayer = this.buildDoLayer(store);
    for (const result of results) {
      runEffect(
        notifyResult(result).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              if (result.source === "telegram") {
                this.sendProgressDraft(store, result.sourceMeta);
              }
            })
          ),
          Effect.provide(doLayer)
        )
      ).catch((error) => {
        logger.error("notifyResult effect failed", {
          ...safeErrorInfo(error),
          linkId: result.linkId,
        });
      });
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

    if (
      result.status === "ingested" &&
      result.linkId &&
      msg.source === "telegram"
    ) {
      this.sendProgressDraft(store, msg.sourceMeta);
    }

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
  }
}
