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
import { Effect, Layer } from "effect";

import { events, schema, tables } from "../../livestore/schema";
import { maskId, safeErrorInfo } from "../log-utils";
import { logSync } from "../logger";
import { type Env } from "../shared";
import { cancelStaleLinks, ingestLink, notifyResult } from "./do-programs";
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
import { type LinkQueueMessage } from "./types";

const logger = logSync("LinkProcessorDO");

const SNAPSHOT_CHUNK_SIZE = 128 * 1024;

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function chunkUint8Array(data: Uint8Array, chunkSize: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize));
  }
  return chunks;
}

type SnapshotMeta = {
  stateChunks: number;
  eventlogChunks: number;
  savedAt: number;
};

type Link = typeof tables.links.Type;

export class LinkProcessorDO
  extends DurableObject<Env>
  implements ClientDoWithRpcCallback
{
  __DURABLE_OBJECT_BRAND = "link-processor-do" as never;

  private storeId: string | undefined;
  private cachedStore: Store<typeof schema> | undefined;
  private storePromise: Promise<Store<typeof schema>> | undefined;
  private subscription: Unsubscribe | undefined;
  private currentlyProcessing = new Set<string>();
  private reprocessQueue = new Set<string>();
  private notifiedLinkIds = new Set<string>();
  private hasRunCleanup = false;
  private totalRowsWritten = 0;
  private exportFns:
    | { exportState: () => Uint8Array; exportEventlog: () => Uint8Array }
    | undefined;

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

  private async loadSnapshot(): Promise<
    { state: Uint8Array; eventlog: Uint8Array } | undefined
  > {
    const meta = await this.ctx.storage.get<SnapshotMeta>("snapshot:meta");
    if (!meta) return undefined;

    const stateKeys = Array.from(
      { length: meta.stateChunks },
      (_, i) => `snapshot:state:${i}`
    );
    const eventlogKeys = Array.from(
      { length: meta.eventlogChunks },
      (_, i) => `snapshot:eventlog:${i}`
    );

    const allChunks = await this.ctx.storage.get<Uint8Array>([
      ...stateKeys,
      ...eventlogKeys,
    ]);

    const stateChunks: Uint8Array[] = [];
    for (const key of stateKeys) {
      const chunk = allChunks.get(key);
      if (!chunk) return undefined;
      stateChunks.push(chunk);
    }

    const eventlogChunks: Uint8Array[] = [];
    for (const key of eventlogKeys) {
      const chunk = allChunks.get(key);
      if (!chunk) return undefined;
      eventlogChunks.push(chunk);
    }

    const state = concatUint8Arrays(stateChunks);
    const eventlog = concatUint8Arrays(eventlogChunks);

    logger.info("Snapshot loaded", {
      stateSize: state.length,
      eventlogSize: eventlog.length,
      stateChunks: meta.stateChunks,
      eventlogChunks: meta.eventlogChunks,
    });

    return { state, eventlog };
  }

  private async saveSnapshot(): Promise<void> {
    if (!this.exportFns) return;

    const state = this.exportFns.exportState();
    const eventlog = this.exportFns.exportEventlog();

    const stateChunks = chunkUint8Array(state, SNAPSHOT_CHUNK_SIZE);
    const eventlogChunks = chunkUint8Array(eventlog, SNAPSHOT_CHUNK_SIZE);

    const oldMeta = await this.ctx.storage.get<SnapshotMeta>("snapshot:meta");

    const entries: Record<string, Uint8Array | SnapshotMeta> = {};
    for (let i = 0; i < stateChunks.length; i++) {
      entries[`snapshot:state:${i}`] = stateChunks[i];
    }
    for (let i = 0; i < eventlogChunks.length; i++) {
      entries[`snapshot:eventlog:${i}`] = eventlogChunks[i];
    }
    entries["snapshot:meta"] = {
      stateChunks: stateChunks.length,
      eventlogChunks: eventlogChunks.length,
      savedAt: Date.now(),
    };
    await this.ctx.storage.put(entries);

    if (oldMeta) {
      const staleKeys: string[] = [];
      for (let i = stateChunks.length; i < oldMeta.stateChunks; i++) {
        staleKeys.push(`snapshot:state:${i}`);
      }
      for (let i = eventlogChunks.length; i < oldMeta.eventlogChunks; i++) {
        staleKeys.push(`snapshot:eventlog:${i}`);
      }
      if (staleKeys.length > 0) {
        await this.ctx.storage.delete(staleKeys);
      }
    }

    const totalChunks = stateChunks.length + eventlogChunks.length;
    logger.info("Snapshot saved", {
      stateSize: state.length,
      eventlogSize: eventlog.length,
      stateChunks: stateChunks.length,
      eventlogChunks: eventlogChunks.length,
      estimatedRowsWritten: totalChunks + 1,
    });
  }

  private async getStore(): Promise<Store<typeof schema>> {
    if (this.cachedStore) {
      return this.cachedStore;
    }
    if (this.storePromise) {
      return this.storePromise;
    }
    this.storePromise = this.initStore();
    try {
      return await this.storePromise;
    } catch (error) {
      this.storePromise = undefined;
      throw error;
    }
  }

  private async initStore(): Promise<Store<typeof schema>> {
    if (!this.storeId) {
      throw new Error("storeId not set");
    }

    const snapshotData = await this.loadSnapshot();
    const sessionId = await this.getSessionId();
    logger.info("Creating store", {
      sessionId: maskId(sessionId),
      storeId: maskId(this.storeId),
      hasSnapshot: !!snapshotData,
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
      snapshotData,
      onExportReady: (fns) => {
        this.exportFns = fns;
      },
      storeId: this.storeId,
      syncBackendStub: this.env.SYNC_BACKEND_DO.get(
        this.env.SYNC_BACKEND_DO.idFromName(this.storeId)
      ) as never,
    });

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
          return !status || status.status === "pending";
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

    const doLayer = this.buildDoLayer(store);
    runEffect(
      SourceNotifier.pipe(
        Effect.flatMap((n) => n.react(link.source, link.sourceMeta, "🤔")),
        Effect.provide(doLayer)
      )
    ).catch(() => {});

    try {
      const rowsBefore = this.totalRowsWritten;
      const features = await Effect.runPromise(
        FeatureStore.pipe(
          Effect.flatMap((fs) => fs.getFeatures(this.storeId!)),
          Effect.provide(FeatureStoreLive(this.env.DB))
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
          isRetry,
          link: { id: link.id, url: link.url },
        }).pipe(Effect.provide(liveLayer))
      );
      logger.info("Link processed", {
        linkId: link.id,
        rowsWritten: this.totalRowsWritten - rowsBefore,
        totalRowsWritten: this.totalRowsWritten,
      });

      try {
        await this.saveSnapshot();
      } catch (snapshotError) {
        logger.error("Snapshot save failed", safeErrorInfo(snapshotError));
      }
    } catch (error) {
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

    const doLayer = this.buildDoLayer(store);
    return runEffect(
      ingestLink({
        url: msg.url,
        storeId: msg.storeId,
        source: msg.source,
        sourceMeta: msg.sourceMeta,
      }).pipe(Effect.provide(doLayer))
    );
  }

  async syncUpdateRpc(payload: unknown): Promise<void> {
    if (!this.storeId) {
      this.storeId = await this.ctx.storage.get<string>("storeId");
    }

    if (this.storeId) {
      await this.ensureSubscribed();
    }

    await handleSyncUpdateRpc(payload);

    // Fallback: directly check for pending links after sync update.
    // If the mailbox delivered the update but the subscription didn't fire,
    // this ensures processing still starts.
    if (this.cachedStore && this.currentlyProcessing.size === 0) {
      this.processNextPending(this.cachedStore);
    }
  }
}
