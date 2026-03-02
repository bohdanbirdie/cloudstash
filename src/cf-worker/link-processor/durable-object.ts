import {
  createStoreDoPromise,
  type ClientDoWithRpcCallback,
} from "@livestore/adapter-cloudflare";
import {
  computed,
  nanoid,
  queryDb,
  type Store,
  type Unsubscribe,
} from "@livestore/livestore";
import { handleSyncUpdateRpc } from "@livestore/sync-cf/client";
/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { Api } from "grammy";

import { events, schema, tables } from "../../livestore/schema";
import { createDb } from "../db";
import { organization, type OrgFeatures } from "../db/schema";
import { maskId, safeErrorInfo } from "../log-utils";
import { logSync } from "../logger";
import { type Env } from "../shared";
import { runEffect } from "./logger";
import { processLink } from "./process-link";
import { AiSummaryGeneratorLive } from "./services/ai-summary-generator.live";
import { ContentExtractorLive } from "./services/content-extractor.live";
import { LinkEventStoreLive } from "./services/link-event-store.live";
import { MetadataFetcherLive } from "./services/metadata-fetcher.live";
import { WorkersAiLive } from "./services/workers-ai.live";
import { type LinkQueueMessage } from "./types";

const logger = logSync("LinkProcessorDO");

const STUCK_TIMEOUT_MS = 5 * 60 * 1000;

type Link = typeof tables.links.Type;

export class LinkProcessorDO
  extends DurableObject<Env>
  implements ClientDoWithRpcCallback
{
  __DURABLE_OBJECT_BRAND = "link-processor-do" as never;

  private storeId: string | undefined;
  private cachedStore: Store<typeof schema> | undefined;
  private subscription: Unsubscribe | undefined;
  private currentlyProcessing = new Set<string>();
  private reprocessQueue = new Set<string>();
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

  /** Persisted session ID enables delta sync (only fetch missing events on wakeup) */
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

    if (!this.storeId) {
      throw new Error("storeId not set");
    }

    const sessionId = await this.getSessionId();
    logger.info("Creating store", {
      sessionId: maskId(sessionId),
      storeId: maskId(this.storeId),
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
      storeId: this.storeId,
      syncBackendStub: this.env.SYNC_BACKEND_DO.get(
        this.env.SYNC_BACKEND_DO.idFromName(this.storeId)
      ) as never,
    });

    return this.cachedStore;
  }

  private async getFeatures(): Promise<OrgFeatures> {
    if (!this.storeId) return {};

    const db = createDb(this.env.DB);
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, this.storeId),
      columns: { features: true },
    });

    const features = org?.features ?? {};
    logger.debug("Fetched features", {
      storeId: maskId(this.storeId),
      hasAiSummary: !!features.aiSummary,
    });
    return features;
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
          return !status || status.status === "pending";
        });
      },
      { label: "pendingLinks" }
    );

    this.subscription = store.subscribe(pendingLinks$, (pendingLinks) => {
      const allStatuses = store.query(statuses$);
      logger.info("Subscription fired", {
        pendingCount: pendingLinks.length,
        totalStatuses: allStatuses.length,
        pendingLinkIds: pendingLinks.map((l) => l.id).slice(0, 5),
      });
      this.onPendingLinksChanged(store, pendingLinks);
    });

    const unnotifiedResults$ = computed(
      (get) => {
        const allStatuses = get(statuses$);
        const allLinks = get(links$);
        const linkMap = new Map(allLinks.map((l) => [l.id, l]));

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
              linkId: s.linkId,
              processingStatus: s.status as "completed" | "failed",
              source: link.source!,
              sourceMeta: link.sourceMeta,
            };
          });
      },
      { label: "unnotifiedResults" }
    );

    store.subscribe(unnotifiedResults$, (results) => {
      if (results.length === 0) return;
      this.notifyResults(store, results);
    });

    this.cancelStaleLinks(store);
  }

  private cancelStaleLinks(store: Store<typeof schema>): void {
    const links = store.query(queryDb(tables.links.where({ deletedAt: null })));
    const statuses = store.query(
      queryDb(tables.linkProcessingStatus.where({}))
    );
    const statusMap = new Map(statuses.map((s) => [s.linkId, s]));
    const now = Date.now();

    let cancelled = 0;
    for (const link of links) {
      if (this.currentlyProcessing.has(link.id)) continue;

      const status = statusMap.get(link.id);
      if (status?.status === "completed" || status?.status === "cancelled")
        continue;

      const updatedAt = status
        ? new Date(status.updatedAt).getTime()
        : new Date(link.createdAt).getTime();
      if (now - updatedAt <= STUCK_TIMEOUT_MS) continue;

      store.commit(
        events.linkProcessingCancelled({
          linkId: link.id,
          updatedAt: new Date(),
        })
      );
      cancelled++;
    }

    if (cancelled > 0) {
      logger.info("Cancelled stale links on startup", { cancelled });
    }
  }

  private onPendingLinksChanged(
    store: Store<typeof schema>,
    pendingLinks: readonly Link[]
  ): void {
    for (const link of pendingLinks) {
      if (this.currentlyProcessing.has(link.id)) continue;

      const existingStatus = store.query(
        queryDb(tables.linkProcessingStatus.where({ linkId: link.id }))
      );
      const isRetry =
        existingStatus.length > 0 && existingStatus[0].status === "pending";

      if (isRetry && existingStatus[0]) {
        const elapsed =
          Date.now() - new Date(existingStatus[0].updatedAt).getTime();
        if (elapsed > STUCK_TIMEOUT_MS) {
          logger.info("Failing stuck link", {
            linkId: link.id,
            stuckMs: elapsed,
          });
          store.commit(
            events.linkProcessingFailed({
              error: "stuck_timeout",
              linkId: link.id,
              updatedAt: new Date(),
            })
          );
        }
      }
    }

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
      return !status || status.status === "pending";
    });

    if (!nextLink) return;

    const existingStatus = statusMap.get(nextLink.id);
    const isRetry = !!existingStatus && existingStatus.status === "pending";

    logger.info("Processing link decision", {
      linkId: nextLink.id,
      status: existingStatus?.status ?? "none",
      isRetry,
    });

    this.processLinkAsync(store, nextLink, isRetry).catch((error) => {
      logger.error("processLinkAsync error", {
        ...safeErrorInfo(error),
        linkId: nextLink.id,
      });
    });
  }

  private async processLinkAsync(
    store: Store<typeof schema>,
    link: Link,
    isRetry: boolean
  ): Promise<void> {
    this.currentlyProcessing.add(link.id);

    logger.info("Processing", { isRetry, linkId: link.id });

    this.reactToSource(link.source, link.sourceMeta, "🤔").catch(() => {});

    try {
      const rowsBefore = this.totalRowsWritten;
      const features = await this.getFeatures();

      const liveLayer = Layer.mergeAll(
        MetadataFetcherLive,
        ContentExtractorLive,
        AiSummaryGeneratorLive,
        LinkEventStoreLive(store)
      ).pipe(Layer.provide(WorkersAiLive(this.env.AI)));

      await runEffect(
        processLink({
          aiSummaryEnabled: features.aiSummary ?? false,
          isRetry,
          link: { id: link.id, url: link.url },
        }).pipe(Effect.provide(liveLayer))
      );
      logger.info("Link processed", {
        linkId: link.id,
        rowsWritten: this.totalRowsWritten - rowsBefore,
        totalRowsWritten: this.totalRowsWritten,
      });
    } catch (error) {
      // processLink's catchAllCause handles all errors internally.
      // If we get here, the store itself is dead — no point trying to commit.
      logger.error("processLinkAsync failed (store likely dead)", {
        ...safeErrorInfo(error),
        linkId: link.id,
      });
      this.cachedStore = undefined;
      this.subscription = undefined;
    } finally {
      this.currentlyProcessing.delete(link.id);
      if (this.cachedStore) {
        if (this.reprocessQueue.has(link.id)) {
          this.reprocessQueue.delete(link.id);
          logger.info("Reprocessing queued link", { linkId: link.id });
          store.commit(
            events.linkProcessingStarted({
              linkId: link.id,
              updatedAt: new Date(),
            })
          );
        }
        this.processNextPending(store);
      }
    }
  }

  private notifyResults(
    store: Store<typeof schema>,
    results: ReadonlyArray<{
      linkId: string;
      processingStatus: "completed" | "failed";
      source: string;
      sourceMeta: string | null;
    }>
  ): void {
    for (const result of results) {
      logger.info("Notifying source", {
        linkId: result.linkId,
        source: result.source,
        status: result.processingStatus,
      });

      const emoji = result.processingStatus === "completed" ? "👍" : "👎";

      Promise.all([
        this.reactToSource(result.source, result.sourceMeta, emoji),
        result.processingStatus === "failed"
          ? this.replyToSource(
              result.source,
              result.sourceMeta,
              "Failed to process link."
            )
          : Promise.resolve(),
      ])
        .catch((error) => {
          logger.error("Notification failed", {
            ...safeErrorInfo(error),
            linkId: result.linkId,
            source: result.source,
          });
        })
        .finally(() => {
          store.commit(
            events.linkSourceNotified({
              linkId: result.linkId,
              notifiedAt: new Date(),
            })
          );
        });
    }
  }

  private async reactToSource(
    source: string | null,
    sourceMeta: string | null,
    emoji: "🤔" | "👌" | "👍" | "👎"
  ): Promise<void> {
    if (source !== "telegram" || !sourceMeta) return;

    const meta = JSON.parse(sourceMeta) as {
      chatId?: number;
      messageId?: number;
    };
    if (!meta.chatId || !meta.messageId) return;

    const api = new Api(this.env.TELEGRAM_BOT_TOKEN);
    await api.setMessageReaction(meta.chatId, meta.messageId, [
      { type: "emoji", emoji },
    ]);
  }

  private async replyToSource(
    source: string | null,
    sourceMeta: string | null,
    text: string
  ): Promise<void> {
    if (source !== "telegram" || !sourceMeta) return;

    const meta = JSON.parse(sourceMeta) as {
      chatId?: number;
      messageId?: number;
    };
    if (!meta.chatId) return;

    const api = new Api(this.env.TELEGRAM_BOT_TOKEN);
    await api.sendMessage(meta.chatId, text, {
      reply_parameters: meta.messageId
        ? { message_id: meta.messageId }
        : undefined,
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const storeId = url.searchParams.get("storeId");
    const reprocessLinkId = url.searchParams.get("reprocess");

    if (!storeId) {
      return new Response("Missing storeId", { status: 400 });
    }

    this.storeId = storeId;
    await this.ctx.storage.put("storeId", storeId);

    if (reprocessLinkId) {
      return this.handleReprocess(reprocessLinkId);
    }

    await this.ensureSubscribed();
    return new Response("OK");
  }

  private async handleReprocess(linkId: string): Promise<Response> {
    const json = (body: object, status = 200) =>
      new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
        status,
      });

    await this.ensureSubscribed();
    const store = await this.getStore();

    if (this.currentlyProcessing.has(linkId)) {
      logger.info("Queuing reprocess (link currently processing)", { linkId });
      this.reprocessQueue.add(linkId);
      return json({ status: "queued" });
    }

    // Don't commit linkProcessingStarted here — the client already committed it.
    // Just ensure we pick up the pending link and start processing.
    this.processNextPending(store);

    return json({ status: "reprocessing" });
  }

  async ingestAndProcess(
    msg: LinkQueueMessage
  ): Promise<{ status: string; linkId?: string }> {
    this.storeId = msg.storeId;
    await this.ctx.storage.put("storeId", msg.storeId);

    const store = await this.getStore();
    await this.ensureSubscribed();

    let domain: string;
    try {
      domain = new URL(msg.url).hostname.replace(/^www\./, "");
    } catch {
      logger.warn("Invalid URL in queue message", { url: msg.url });
      return { status: "invalid_url" };
    }

    const existing = store.query(queryDb(tables.links.where({ url: msg.url })));
    if (existing.length > 0) {
      logger.info("Duplicate link from queue", {
        existingId: existing[0].id,
        storeId: maskId(msg.storeId),
      });
      this.reactToSource(msg.source, msg.sourceMeta ?? null, "👌").catch(
        () => {}
      );
      this.replyToSource(
        msg.source,
        msg.sourceMeta ?? null,
        "Link already saved."
      ).catch(() => {});
      return { status: "duplicate", linkId: existing[0].id };
    }

    const linkId = nanoid();
    logger.info("Ingesting link from queue", {
      linkId,
      source: msg.source,
      storeId: maskId(msg.storeId),
    });

    store.commit(
      events.linkCreatedV2({
        createdAt: new Date(),
        domain,
        id: linkId,
        source: msg.source,
        sourceMeta: msg.sourceMeta,
        url: msg.url,
      })
    );

    return { status: "ingested", linkId };
  }

  async syncUpdateRpc(payload: unknown): Promise<void> {
    if (!this.storeId) {
      this.storeId = await this.ctx.storage.get<string>("storeId");
    }

    if (this.storeId) {
      await this.ensureSubscribed();
    }

    await handleSyncUpdateRpc(payload);
  }
}
