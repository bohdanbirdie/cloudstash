import { createStoreDoPromise } from "@livestore/adapter-cloudflare";
import type { ClientDoWithRpcCallback } from "@livestore/adapter-cloudflare";
import { computed, nanoid, queryDb } from "@livestore/livestore";
import type { Store, Unsubscribe } from "@livestore/livestore";
import { handleSyncUpdateRpc } from "@livestore/sync-cf/client";
/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import { DateTime, Effect, Layer, Option, Semaphore } from "effect";

import type {
  GetLinkInput,
  ListLinksInput,
  SearchLinksInput,
  UpdateLinkInput,
  UpdateLinksInput,
} from "@/lib/links-contract";
import { capabilitiesFor } from "@/lib/plan";
import type { TierCapabilities } from "@/lib/plan";

import { events, schema, tables } from "../../livestore/schema";
import {
  captureSyncTarget,
  whenLeaderSynced,
} from "../../livestore/when-leader-synced";
import { Billing } from "../billing/service";
import { LinkId, OrgId } from "../db/branded";
import { DbClientLive } from "../db/service";
import { maskId, safeErrorInfo } from "../log-utils";
import { logSync } from "../logger";
import type { Env } from "../shared";
import { OpenRouterApiKeyLive } from "../weekly-digest/generator";
import type {
  SaveLinkRpcInput,
  WorkspaceLinksRpcResult,
} from "../workspace-links/rpc";
import { WorkspaceLinksRpc } from "../workspace-links/rpc";
import { EnrichmentGenerator } from "../x-enrichment/generator";
import { ThreadProviderNoopLive } from "../x-enrichment/services/thread-provider-noop.live";
import { EnrichmentUsageLive } from "../x-enrichment/usage";
import {
  isDeletionTombstoneSet,
  setDeletionTombstone,
} from "./deletion-tombstone";
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
import { MAX_CONCURRENT_AI, MAX_CONCURRENT_METADATA } from "./types";
import type { LinkQueueMessage } from "./types";

const logger = logSync("LinkProcessorDO");

const MAX_NOTIFIED_LINK_IDS = 500;
const LEADER_SYNC_TIMEOUT_MS = 10_000;

import type { WeeklyDigestRpcResult } from "../weekly-digest/rpc";
import { runDigestGeneration } from "../weekly-digest/run-digest";
import {
  DigestScheduler,
  DigestSchedulerLive,
} from "../weekly-digest/scheduler";
import type { DigestSchedulerDeps } from "../weekly-digest/scheduler";

export type { WeeklyDigestRpcResult };

import {
  evictOldestFromSet,
  getProgressDraftText,
  parseMeta,
} from "./progress-draft";

type Link = typeof tables.links.Type;

const workspaceUnavailable = () =>
  ({
    ok: false,
    error: { code: "unavailable", message: "Workspace is being deleted" },
  }) as const;

export class LinkProcessorDO
  extends DurableObject<Env>
  implements ClientDoWithRpcCallback
{
  override __DURABLE_OBJECT_BRAND = "link-processor-do" as never;

  private storeId: OrgId | undefined;
  private cachedStore: Store<typeof schema> | undefined;
  private storeCreationPromise: Promise<Store<typeof schema>> | undefined;
  private subscriptions = new Set<Unsubscribe>();
  private storeGeneration = 0;
  private submittedLinks = new Set<string>();
  private metadataSemaphore = Semaphore.makeUnsafe(MAX_CONCURRENT_METADATA);
  private aiSemaphore = Semaphore.makeUnsafe(MAX_CONCURRENT_AI);
  private notifiedLinkIds = new Set<string>();
  private hasRunCleanup = false;
  private totalRowsWritten = 0;
  private deleting = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const origExec = this.ctx.storage.sql.exec.bind(this.ctx.storage.sql);
    this.ctx.storage.sql.exec = ((...args: unknown[]) => {
      const cursor = origExec(args[0] as string, ...args.slice(1));
      this.totalRowsWritten += cursor.rowsWritten;
      return cursor;
    }) as typeof origExec;
  }

  /**
   * Persistent tombstone + tear-down of in-memory store handles. Called by
   * `AccountDeletionWorkflow` *before* `purgeAll`, so any concurrent queue
   * message that arrives between this call and the wipe drops on the
   * tombstone check at the top of `ingestAndProcess`.
   */
  async markDeleting(): Promise<void> {
    this.deleting = true;
    const store = this.resetStoreHandles();
    await runEffect(
      Effect.gen({ self: this }, function* () {
        yield* Effect.promise(() => setDeletionTombstone(this.ctx.storage));
        yield* Effect.promise(
          () => store?.shutdownPromise?.() ?? Promise.resolve()
        );
        yield* Effect.logInfo("markDeleting: tombstone set").pipe(
          Effect.annotateLogs({ storeId: maskId(this.storeId ?? "") })
        );
      }).pipe(Effect.withSpan("LinkProcessorDO.markDeleting"))
    );
  }

  /**
   * In-flight Livestore writes can race `deleteAll()` — mitigated by the
   * tombstone + DO eviction (see account-deletion.md, B1 deferred). The
   * shutdown-promise + fiber-tracking workaround lives there too if needed.
   */
  async purgeAll(): Promise<void> {
    this.deleting = true;
    const store = this.resetStoreHandles();
    await runEffect(
      Effect.gen({ self: this }, function* () {
        yield* Effect.promise(
          () => store?.shutdownPromise?.() ?? Promise.resolve()
        );
        yield* Effect.promise(() => {
          // Consecutive SQLite-backed DO writes without an intervening await
          // are committed atomically by the storage output gate.
          const purge = this.ctx.storage.deleteAll();
          const fence = setDeletionTombstone(this.ctx.storage);
          return Promise.all([purge, fence]);
        });
        yield* Effect.logInfo("purgeAll: storage wiped").pipe(
          Effect.annotateLogs({ storeId: maskId(this.storeId ?? "") })
        );
      }).pipe(Effect.withSpan("LinkProcessorDO.purgeAll"))
    );
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
    if (this.deleting) throw new Error("Workspace is being deleted");
    if (this.cachedStore) {
      return this.cachedStore;
    }

    if (this.storeCreationPromise) {
      return this.storeCreationPromise;
    }

    if (!this.storeId) {
      throw new Error("storeId not set");
    }

    const generation = this.storeGeneration;
    const storeId = this.storeId;
    const creation = this.createStoreInternal(storeId, generation);
    this.storeCreationPromise = creation;

    try {
      return await creation;
    } finally {
      if (this.storeCreationPromise === creation) {
        this.storeCreationPromise = undefined;
      }
    }
  }

  private async createStoreInternal(
    storeId: OrgId,
    generation: number
  ): Promise<Store<typeof schema>> {
    const sessionId = await this.getSessionId();
    if (!this.canUseStore(generation)) {
      throw new Error("Workspace is being deleted");
    }

    logger.info("Creating store", {
      sessionId: maskId(sessionId),
      storeId: maskId(storeId),
    });

    const store = await createStoreDoPromise({
      clientId: "link-processor-do",
      durableObject: {
        bindingName: "LINK_PROCESSOR_DO",
        ctx: this.ctx,
        env: this.env,
      } as never,
      livePull: true,
      schema,
      sessionId,
      storeId,
      syncBackendStub: this.env.SYNC_BACKEND_DO.get(
        this.env.SYNC_BACKEND_DO.idFromName(storeId)
      ) as never,
    });

    if (!this.canUseStore(generation)) {
      await store.shutdownPromise?.();
      throw new Error("Workspace is being deleted");
    }
    this.cachedStore = store;

    logger.info("Store created successfully", {
      storeId: maskId(storeId),
    });

    return store;
  }

  private canUseStore(generation: number): boolean {
    return !this.deleting && generation === this.storeGeneration;
  }

  private resetStoreHandles(): Store<typeof schema> | undefined {
    this.storeGeneration += 1;
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.subscriptions.clear();
    const store = this.cachedStore;
    this.cachedStore = undefined;
    this.storeCreationPromise = undefined;
    return store;
  }

  private buildDoLayer(store: Store<typeof schema>) {
    return Layer.mergeAll(
      LinkRepositoryLive(store),
      SourceNotifierLive(this.env.TELEGRAM_BOT_TOKEN)
    );
  }

  private async isDeleting(): Promise<boolean> {
    if (this.deleting) return true;
    this.deleting ||= await isDeletionTombstoneSet(this.ctx.storage);
    return this.deleting;
  }

  private async runWorkspaceLinksRpc<Value, Error>(
    operation: (
      store: Store<typeof schema>,
      canCommit: () => boolean
    ) => Effect.Effect<WorkspaceLinksRpcResult<Value>, Error>
  ): Promise<WorkspaceLinksRpcResult<Value>> {
    if (await this.isDeleting()) return workspaceUnavailable();
    const generation = this.storeGeneration;

    const storeId = this.ctx.id.name;
    if (!storeId) throw new Error("LinkProcessorDO requires a named instance");
    if (this.storeId !== storeId) {
      this.storeId = OrgId.make(storeId);
      await this.ctx.storage.put("storeId", storeId);
    }

    await this.ensureSubscribed();
    if (!this.canUseStore(generation)) return workspaceUnavailable();
    const store = await this.getStore();
    if (!this.canUseStore(generation)) return workspaceUnavailable();
    return runEffect(operation(store, () => this.canUseStore(generation)));
  }

  async listLinks(input: ListLinksInput) {
    return this.runWorkspaceLinksRpc((store, canCommit) =>
      WorkspaceLinksRpc.list(store, input, canCommit)
    );
  }

  async searchLinks(input: SearchLinksInput) {
    return this.runWorkspaceLinksRpc((store, canCommit) =>
      WorkspaceLinksRpc.search(store, input, canCommit)
    );
  }

  async getLink(input: GetLinkInput) {
    return this.runWorkspaceLinksRpc((store, canCommit) =>
      WorkspaceLinksRpc.get(store, input, canCommit)
    );
  }

  async saveLink(input: SaveLinkRpcInput) {
    return this.runWorkspaceLinksRpc((store, canCommit) =>
      WorkspaceLinksRpc.save(store, input, canCommit)
    );
  }

  async updateLink(input: UpdateLinkInput) {
    return this.runWorkspaceLinksRpc((store, canCommit) =>
      WorkspaceLinksRpc.update(store, input, canCommit)
    );
  }

  async updateLinks(input: UpdateLinksInput) {
    return this.runWorkspaceLinksRpc((store, canCommit) =>
      WorkspaceLinksRpc.updateMany(store, input, canCommit)
    );
  }

  private async ensureSubscribed(): Promise<void> {
    if (this.subscriptions.size > 0) {
      return;
    }

    const generation = this.storeGeneration;
    const store = await this.getStore();
    if (!this.canUseStore(generation)) {
      throw new Error("Workspace is being deleted");
    }

    const links$ = queryDb(tables.links.where({ deletedAt: null }));
    const statuses$ = queryDb(tables.linkProcessingStatus.where({}));

    const pendingLinks$ = computed(
      (get) => {
        const links = get(links$);
        const statuses = get(statuses$);
        const statusMap = new Map(statuses.map((s) => [s.linkId, s]));

        return links.filter((link) => {
          const status = statusMap.get(link.id);
          if (
            status === undefined &&
            (link.source === "api" || link.source === "mcp")
          ) {
            return false;
          }
          return (
            !status ||
            status.status === "pending" ||
            status.status === "reprocess-requested"
          );
        });
      },
      { label: "pendingLinks" }
    );

    const pendingSubscription = store.subscribe(
      pendingLinks$,
      (pendingLinks) => {
        if (!this.canUseStore(generation)) return;
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

        const processing = runEffect(
          Effect.forEach(
            newLinks,
            (link) => {
              const status = statusMap.get(link.id)?.status;
              const isReprocess = status === "reprocess-requested";
              return this.processLinkEffect(
                store,
                link,
                isReprocess,
                status === "pending"
              ).pipe(
                Effect.ensuring(
                  Effect.sync(() => this.submittedLinks.delete(link.id))
                )
              );
            },
            { concurrency: MAX_CONCURRENT_METADATA, discard: true }
          )
        ).then(async () => {
          const target = captureSyncTarget(store);
          const synced = await whenLeaderSynced(store, {
            target,
            timeoutMs: LEADER_SYNC_TIMEOUT_MS,
          });
          if (!synced) {
            logger.warn("Processing durability barrier timed out", {
              storeId: maskId(this.storeId ?? ""),
            });
          }
        });

        this.ctx.waitUntil(processing);
      }
    );
    this.subscriptions.add(pendingSubscription);

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

    const resultSubscription = store.subscribe(
      unnotifiedResults$,
      (results) => {
        if (!this.canUseStore(generation)) return;
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
      }
    );
    this.subscriptions.add(resultSubscription);

    if (!this.canUseStore(generation)) {
      this.resetStoreHandles();
      throw new Error("Workspace is being deleted");
    }

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

    this.ensureDigestScheduled().catch((error) => {
      logger.error("ensureDigestScheduled failed", safeErrorInfo(error));
    });
  }

  private capabilities(): Effect.Effect<TierCapabilities> {
    return FeatureStore.pipe(
      Effect.flatMap((fs) => fs.getCapabilities(this.storeId!)),
      Effect.provide(
        FeatureStoreLive.pipe(
          Layer.provide(Billing.Default),
          Layer.provide(DbClientLive(this.env.DB))
        )
      ),
      Effect.catchDefect((defect) =>
        Effect.logError(
          "LinkProcessor: feature-store defect, defaulting to free tier"
        ).pipe(
          Effect.annotateLogs({
            storeId: maskId(this.storeId ?? ""),
            cause: String(defect),
          }),
          Effect.as(capabilitiesFor("free"))
        )
      )
    );
  }

  private processLinkEffect(
    store: Store<typeof schema>,
    link: Link,
    isReprocess: boolean,
    startRecorded: boolean
  ): Effect.Effect<void> {
    return Effect.gen({ self: this }, function* () {
      yield* Effect.logInfo("Processing link").pipe(
        Effect.annotateLogs({
          linkId: link.id,
          isReprocess,
        })
      );

      if (!startRecorded) {
        const now = yield* DateTime.nowAsDate;
        store.commit(
          events.linkProcessingStarted({
            linkId: link.id,
            updatedAt: now,
          })
        );
      }

      if (link.source === "telegram") {
        this.sendProgressDraft(store, link.sourceMeta);
      }

      const rowsBefore = this.totalRowsWritten;

      const capabilities = yield* this.capabilities();

      yield* Effect.logDebug("LinkProcessor capabilities").pipe(
        Effect.annotateLogs({
          linkId: link.id,
          aiSummary: capabilities.aiSummary,
        })
      );

      const applicationHostname = new URL(this.env.BETTER_AUTH_URL).hostname;
      const liveLayer = Layer.mergeAll(
        MetadataFetcherLive(applicationHostname),
        ContentExtractorLive(applicationHostname),
        AiSummaryGeneratorLive,
        LinkEventStoreLive(store),
        ThreadProviderNoopLive,
        EnrichmentGenerator.Default,
        EnrichmentUsageLive({ kv: this.env.ENRICHMENT_USAGE })
      ).pipe(
        Layer.provide(WorkersAiLive(this.env.AI)),
        Layer.provide(OpenRouterApiKeyLive(this.env.OPENROUTER_API_KEY))
      );

      yield* processLink({
        aiSummaryEnabled: capabilities.aiSummary,
        xContentEnrichmentEnabled: capabilities.xContentEnrichment,
        storeId: this.storeId!,
        link: { id: LinkId.make(link.id), url: link.url },
        skipStartedEvent: true,
        metadataSemaphore: this.metadataSemaphore,
        aiSemaphore: this.aiSemaphore,
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
      Effect.catchDefect((defect) =>
        Effect.logError("processLinkEffect failed (store likely dead)").pipe(
          Effect.annotateLogs({
            ...safeErrorInfo(defect),
            linkId: link.id,
          }),
          Effect.tap(() =>
            Effect.sync(() => {
              this.resetStoreHandles();
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
        Effect.catch((error) =>
          Effect.logWarning("sendProgressDraft failed").pipe(
            Effect.annotateLogs(safeErrorInfo(error))
          )
        ),
        Effect.provide(doLayer)
      )
    ).catch((error) => {
      logger.error("sendProgressDraft escaped", safeErrorInfo(error));
    });
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
    if (await this.isDeleting()) {
      return new Response("Workspace is being deleted", { status: 410 });
    }

    const url = new URL(request.url);
    const storeId = url.searchParams.get("storeId");

    if (!storeId) {
      return new Response("Missing storeId", { status: 400 });
    }

    if (this.ctx.id.name !== storeId) {
      await runEffect(
        Effect.logError("storeId mismatch in fetch").pipe(
          Effect.annotateLogs({
            expected: maskId(this.ctx.id.name ?? ""),
            storeId: maskId(storeId),
          }),
          Effect.withSpan("LinkProcessorDO.storeIdMismatch", {
            attributes: {
              expected: maskId(this.ctx.id.name ?? ""),
              route: "fetch",
              storeId: maskId(storeId),
            },
          })
        )
      );
      return new Response("storeId mismatch", { status: 400 });
    }

    logger.info("fetch called (triggerLinkProcessor)", {
      hadCachedStore: !!this.cachedStore,
      hadSubscription: this.subscriptions.size > 0,
      storeId: maskId(storeId),
    });

    this.storeId = OrgId.make(storeId);
    await this.ctx.storage.put("storeId", storeId);

    await this.ensureSubscribed();
    return new Response("OK");
  }

  async ingestAndProcess(
    msg: LinkQueueMessage
  ): Promise<{ status: string; linkId?: string }> {
    if (this.ctx.id.name !== msg.storeId) {
      await runEffect(
        Effect.logError("storeId mismatch in ingestAndProcess").pipe(
          Effect.annotateLogs({
            expected: maskId(this.ctx.id.name ?? ""),
            storeId: maskId(msg.storeId),
          }),
          Effect.withSpan("LinkProcessorDO.storeIdMismatch", {
            attributes: {
              expected: maskId(this.ctx.id.name ?? ""),
              route: "ingestAndProcess",
              storeId: maskId(msg.storeId),
            },
          })
        )
      );
      return { status: "rejected-storeid-mismatch" };
    }

    if (await this.isDeleting()) {
      logger.info("ingestAndProcess dropped (deletion in progress)", {
        storeId: maskId(msg.storeId),
        url: msg.url,
      });
      return { status: "dropped-deletion" };
    }

    logger.info("ingestAndProcess called", {
      source: msg.source,
      storeId: maskId(msg.storeId),
      url: msg.url,
      hadCachedStore: !!this.cachedStore,
      hadSubscription: this.subscriptions.size > 0,
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

    if (result.status === "ingested") {
      const target = captureSyncTarget(store);
      const synced = await whenLeaderSynced(store, {
        target,
        timeoutMs: LEADER_SYNC_TIMEOUT_MS,
      });
      if (!synced) {
        logger.warn("Ingest durability barrier timed out", {
          linkId: result.linkId,
          storeId: maskId(msg.storeId),
        });
      }
    }

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

  private digestSchedulerDeps(): DigestSchedulerDeps {
    return {
      storage: this.ctx.storage,
      getStoreId: Effect.sync(() => Option.fromNullishOr(this.storeId)),
      setStoreId: (id) =>
        Effect.sync(() => {
          this.storeId = id;
        }),
      getCapabilities: this.capabilities(),
      isDeletionTombstoned: Effect.promise(() =>
        isDeletionTombstoneSet(this.ctx.storage)
      ),
      runDigest: (storeId, trigger) =>
        Effect.gen({ self: this }, function* () {
          const store = yield* Effect.promise(() => this.getStore());
          return yield* runDigestGeneration({
            env: this.env,
            store,
            storeId,
            trigger,
          });
        }),
    };
  }

  async ensureDigestScheduled(): Promise<void> {
    if (await this.isDeleting()) return;
    await runEffect(
      Effect.gen(function* () {
        const scheduler = yield* DigestScheduler;
        yield* scheduler.ensureScheduled;
      }).pipe(Effect.provide(DigestSchedulerLive(this.digestSchedulerDeps())))
    );
  }

  override async alarm(): Promise<void> {
    await runEffect(
      Effect.gen(function* () {
        const scheduler = yield* DigestScheduler;
        yield* scheduler.handleAlarm;
      }).pipe(Effect.provide(DigestSchedulerLive(this.digestSchedulerDeps())))
    );
  }

  async triggerDigest(storeId: OrgId): Promise<WeeklyDigestRpcResult> {
    return runEffect(
      Effect.gen(function* () {
        const scheduler = yield* DigestScheduler;
        return yield* scheduler.triggerDigest(storeId);
      }).pipe(Effect.provide(DigestSchedulerLive(this.digestSchedulerDeps())))
    );
  }

  async syncUpdateRpc(
    payload: Uint8Array<ArrayBuffer>,
    storeId: string
  ): Promise<void> {
    logger.debug("syncUpdateRpc called", {
      hadCachedStore: !!this.cachedStore,
      hadSubscription: this.subscriptions.size > 0,
      hadStoreId: !!this.storeId,
    });

    if (await this.isDeleting()) {
      logger.info("syncUpdateRpc dropped (deletion in progress)", {
        storeId: maskId(storeId),
      });
      return;
    }
    const generation = this.storeGeneration;

    if (!this.storeId) {
      this.storeId = OrgId.make(storeId);
    }

    await this.ensureSubscribed();
    if (!this.canUseStore(generation)) return;
    await handleSyncUpdateRpc(this.ctx, payload);
  }
}
