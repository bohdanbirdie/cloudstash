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
import type { StoreEvent } from "../../livestore/schema";
import {
  captureSyncTarget,
  whenLeaderSynced,
} from "../../livestore/when-leader-synced";
import { Billing } from "../billing/service";
import { LinkId, OrgId } from "../db/branded";
import { DbClientLive } from "../db/service";
import {
  DurableObjectRetiredError,
  isDurableObjectRetired,
  retireDurableObjectStorage,
} from "../durable-object-retirement";
import { fingerprintId, maskId, safeErrorInfo } from "../log-utils";
import { logSync } from "../logger";
import type { Env } from "../shared";
import { OpenRouterApiKeyLive } from "../weekly-digest/generator";
import { WorkspaceLinkUnavailableError } from "../workspace-links/errors";
import type {
  SaveLinkRpcInput,
  WorkspaceLinksRpcResult,
} from "../workspace-links/rpc";
import { WorkspaceLinksRpc } from "../workspace-links/rpc";
import { makeWorkspaceLinks } from "../workspace-links/service";
import type { WorkspaceLinks } from "../workspace-links/service";
import { EnrichmentGenerator } from "../x-enrichment/generator";
import { ThreadProviderNoopLive } from "../x-enrichment/services/thread-provider-noop.live";
import { EnrichmentUsageLive } from "../x-enrichment/usage";
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

const logger = logSync("LibraryDO");

const MAX_NOTIFIED_LINK_IDS = 500;
const LEADER_SYNC_TIMEOUT_MS = 10_000;

import type { WeeklyDigestRpcResult } from "../weekly-digest/rpc";
import {
  digestUnavailable,
  runDigestGeneration,
} from "../weekly-digest/run-digest";
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
    error: { code: "unavailable", message: "Library is unavailable" },
  }) as const;

export class LibraryDO
  extends DurableObject<Env>
  implements ClientDoWithRpcCallback
{
  override __DURABLE_OBJECT_BRAND = "library-do" as never;

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
  private retired = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const origExec = this.ctx.storage.sql.exec.bind(this.ctx.storage.sql);
    this.ctx.storage.sql.exec = ((...args: unknown[]) => {
      const cursor = origExec(args[0] as string, ...args.slice(1));
      this.totalRowsWritten += cursor.rowsWritten;
      return cursor;
    }) as typeof origExec;
  }

  /** Permanently closes this processor and wipes its storage. */
  async retire(): Promise<void> {
    this.retired = true;
    const store = this.resetStoreHandles();
    await runEffect(
      Effect.gen({ self: this }, function* () {
        yield* Effect.promise(() =>
          retireDurableObjectStorage(
            this.ctx.storage,
            () => store?.shutdownPromise?.() ?? Promise.resolve()
          )
        );
        yield* Effect.logInfo("retire: storage wiped").pipe(
          Effect.annotateLogs({ storeId: maskId(this.storeId ?? "") })
        );
      }).pipe(Effect.withSpan("LibraryDO.retire"))
    );
  }

  private async getSessionIdentity(
    generation: number
  ): Promise<{ readonly sessionId: string; readonly reused: boolean }> {
    if (!this.canUseStore(generation)) {
      throw new DurableObjectRetiredError();
    }
    const stored = await this.ctx.storage.get<string>("sessionId");
    if (stored) return { sessionId: stored, reused: true };
    const newSessionId = nanoid();
    if (!this.canUseStore(generation)) {
      throw new DurableObjectRetiredError();
    }
    await this.ctx.storage.put("sessionId", newSessionId);
    return { sessionId: newSessionId, reused: false };
  }

  private async getStore(): Promise<Store<typeof schema>> {
    if (this.retired) throw new DurableObjectRetiredError();
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
    const rowsBeforeBoot = this.totalRowsWritten;
    const databaseSizeBeforeBoot = this.ctx.storage.sql.databaseSize;
    const { reused: reusedSession, sessionId } =
      await this.getSessionIdentity(generation);
    if (!this.canUseStore(generation)) {
      throw new DurableObjectRetiredError();
    }
    const [objectFingerprint, sessionFingerprint] = await Promise.all([
      fingerprintId(this.ctx.id.toString()),
      fingerprintId(sessionId),
    ]);

    logger.info("Creating store", {
      databaseSizeBeforeBoot,
      objectFingerprint,
      reusedSession,
      sessionFingerprint,
      storeId: maskId(storeId),
    });

    const store = await createStoreDoPromise({
      clientId: "link-processor-do",
      durableObject: {
        bindingName: "LIBRARY_DO",
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
      throw new DurableObjectRetiredError();
    }
    this.cachedStore = store;

    logger.info("Store created successfully", {
      databaseSizeAfterBoot: this.ctx.storage.sql.databaseSize,
      rowsWrittenDuringBoot: this.totalRowsWritten - rowsBeforeBoot,
      storeId: maskId(storeId),
    });

    return store;
  }

  private canUseStore(generation: number): boolean {
    return !this.retired && generation === this.storeGeneration;
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

  private buildDoLayer(
    store: Store<typeof schema>,
    generation = this.storeGeneration
  ) {
    const commit = this.commitFor(store, generation);
    return Layer.mergeAll(
      LinkRepositoryLive(store, commit),
      SourceNotifierLive(this.env.TELEGRAM_BOT_TOKEN)
    );
  }

  private commitFor(
    store: Store<typeof schema>,
    generation: number
  ): (
    ...storeEvents: StoreEvent[]
  ) => Effect.Effect<void, DurableObjectRetiredError> {
    return (...storeEvents: StoreEvent[]) => {
      if (!this.canUseStore(generation)) {
        return Effect.fail(new DurableObjectRetiredError());
      }
      return Effect.sync(() => store.commit(...storeEvents));
    };
  }

  private async isRetired(): Promise<boolean> {
    if (this.retired) return true;
    const durable = await isDurableObjectRetired(this.ctx.storage);
    this.retired ||= durable;
    return this.retired;
  }

  private async bindNamedWorkspace(): Promise<OrgId> {
    const name = this.ctx.id.name;
    if (!name) throw new Error("LibraryDO requires a named instance");
    const storeId = OrgId.make(name);
    if (this.storeId !== storeId) {
      this.storeId = storeId;
      await this.ctx.storage.put("storeId", storeId);
    }
    return storeId;
  }

  private async runWorkspaceLinksRpc<Value, Error>(
    operation: (
      links: WorkspaceLinks
    ) => Effect.Effect<WorkspaceLinksRpcResult<Value>, Error>
  ): Promise<WorkspaceLinksRpcResult<Value>> {
    if (await this.isRetired()) return workspaceUnavailable();
    const generation = this.storeGeneration;

    await this.bindNamedWorkspace();

    await this.ensureSubscribed();
    if (!this.canUseStore(generation)) return workspaceUnavailable();
    const store = await this.getStore();
    if (!this.canUseStore(generation)) return workspaceUnavailable();
    const links = makeWorkspaceLinks(store, {
      commit: (_operation, storeEvents) =>
        this.commitFor(
          store,
          generation
        )(...storeEvents).pipe(
          Effect.mapError(() => new WorkspaceLinkUnavailableError())
        ),
    });
    return runEffect(operation(links));
  }

  async listLinks(input: ListLinksInput) {
    return this.runWorkspaceLinksRpc((links) =>
      WorkspaceLinksRpc.list(links, input)
    );
  }

  async searchLinks(input: SearchLinksInput) {
    return this.runWorkspaceLinksRpc((links) =>
      WorkspaceLinksRpc.search(links, input)
    );
  }

  async getLink(input: GetLinkInput) {
    return this.runWorkspaceLinksRpc((links) =>
      WorkspaceLinksRpc.get(links, input)
    );
  }

  async saveLink(input: SaveLinkRpcInput) {
    return this.runWorkspaceLinksRpc((links) =>
      WorkspaceLinksRpc.save(links, input)
    );
  }

  async updateLink(input: UpdateLinkInput) {
    return this.runWorkspaceLinksRpc((links) =>
      WorkspaceLinksRpc.update(links, input)
    );
  }

  async updateLinks(input: UpdateLinksInput) {
    return this.runWorkspaceLinksRpc((links) =>
      WorkspaceLinksRpc.updateMany(links, input)
    );
  }

  private async ensureSubscribed(): Promise<void> {
    if (this.subscriptions.size > 0) {
      return;
    }

    const generation = this.storeGeneration;
    const store = await this.getStore();
    if (!this.canUseStore(generation)) {
      throw new DurableObjectRetiredError();
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
                status === "pending",
                generation
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
        this.notifyResults(store, newResults, generation);
      }
    );
    this.subscriptions.add(resultSubscription);

    if (!this.canUseStore(generation)) {
      this.resetStoreHandles();
      throw new DurableObjectRetiredError();
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
          Effect.provide(this.buildDoLayer(store)),
          Effect.catchTag("DurableObjectRetiredError", () => Effect.void)
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
    startRecorded: boolean,
    generation: number
  ): Effect.Effect<void> {
    return Effect.gen({ self: this }, function* () {
      yield* Effect.logInfo("Processing link").pipe(
        Effect.annotateLogs({
          linkId: link.id,
          isReprocess,
        })
      );

      if (!startRecorded) {
        if (!this.canUseStore(generation)) return;
        const now = yield* DateTime.nowAsDate;
        store.commit(
          events.linkProcessingStarted({
            linkId: link.id,
            updatedAt: now,
          })
        );
      }

      if (link.source === "telegram" && this.canUseStore(generation)) {
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
        LinkEventStoreLive(store, this.commitFor(store, generation)),
        ThreadProviderNoopLive,
        EnrichmentGenerator.Default,
        EnrichmentUsageLive({ storage: this.ctx.storage })
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
          if (link.source === "telegram" && this.canUseStore(generation)) {
            this.sendProgressDraft(store, link.sourceMeta);
          }
        })
      ),
      Effect.catchTag("DurableObjectRetiredError", () =>
        Effect.logInfo("Link processing stopped because the actor retired")
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
      Effect.withSpan("LibraryDO.processLinkEffect", {
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
        Effect.withSpan("LibraryDO.sendProgressDraft"),
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
    results: ReadonlyArray<NotifyResultParams>,
    generation: number
  ): void {
    const doLayer = this.buildDoLayer(store, generation);
    for (const result of results) {
      if (!this.canUseStore(generation)) return;
      runEffect(
        notifyResult(result).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              if (result.source === "telegram") {
                this.sendProgressDraft(store, result.sourceMeta);
              }
            })
          ),
          Effect.provide(doLayer),
          Effect.catchTag("DurableObjectRetiredError", () => Effect.void)
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
    if (await this.isRetired()) {
      return new Response("Processor retired", { status: 410 });
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
          Effect.withSpan("LibraryDO.storeIdMismatch", {
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
          Effect.withSpan("LibraryDO.storeIdMismatch", {
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

    if (await this.isRetired()) {
      logger.info("ingestAndProcess dropped (processor retired)", {
        storeId: maskId(msg.storeId),
        url: msg.url,
      });
      return { status: "dropped-retired" };
    }

    const generation = this.storeGeneration;

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

    if (!this.canUseStore(generation)) {
      return { status: "dropped-retired" };
    }
    const doLayer = this.buildDoLayer(store, generation);
    const result = await runEffect(
      ingestLink({
        url: msg.url,
        storeId: msg.storeId,
        source: msg.source,
        sourceMeta: msg.sourceMeta,
      }).pipe(
        Effect.provide(doLayer),
        Effect.catchTag("DurableObjectRetiredError", () =>
          Effect.succeed({ status: "dropped-retired" as const })
        )
      )
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
      if (this.canUseStore(generation)) {
        this.sendProgressDraft(store, msg.sourceMeta);
      }
    }

    logger.info("ingestAndProcess completed", {
      status: result.status,
      linkId: "linkId" in result ? result.linkId : undefined,
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
      runDigest: (storeId, trigger) =>
        Effect.gen({ self: this }, function* () {
          const generation = this.storeGeneration;
          const store = yield* Effect.promise(() => this.getStore());
          return yield* runDigestGeneration({
            env: this.env,
            store,
            storeId,
            trigger,
            commit: (...storeEvents: StoreEvent[]) => {
              if (!this.canUseStore(generation)) {
                throw new DurableObjectRetiredError();
              }
              return store.commit(...storeEvents);
            },
          });
        }),
    };
  }

  async ensureDigestScheduled(): Promise<void> {
    if (await this.isRetired()) return;
    await this.bindNamedWorkspace();
    const generation = this.storeGeneration;
    try {
      await runEffect(
        Effect.gen(function* () {
          const scheduler = yield* DigestScheduler;
          yield* scheduler.ensureScheduled;
        }).pipe(Effect.provide(DigestSchedulerLive(this.digestSchedulerDeps())))
      );
    } finally {
      if (!this.canUseStore(generation)) await this.ctx.storage.deleteAlarm();
    }
  }

  override async alarm(): Promise<void> {
    if (await this.isRetired()) return;
    const generation = this.storeGeneration;
    try {
      await runEffect(
        Effect.gen(function* () {
          const scheduler = yield* DigestScheduler;
          yield* scheduler.handleAlarm;
        }).pipe(Effect.provide(DigestSchedulerLive(this.digestSchedulerDeps())))
      );
    } finally {
      if (!this.canUseStore(generation)) await this.ctx.storage.deleteAlarm();
    }
  }

  async triggerDigest(storeId: OrgId): Promise<WeeklyDigestRpcResult> {
    if (await this.isRetired()) return digestUnavailable();
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

    if (await this.isRetired()) {
      logger.info("syncUpdateRpc dropped (processor retired)", {
        storeId: maskId(storeId),
      });
      return;
    }
    const generation = this.storeGeneration;

    if (!this.storeId) {
      this.storeId = OrgId.make(storeId);
    }

    await this.ensureSubscribed();
    await this.ctx.blockConcurrencyWhile(async () => {
      if (!this.canUseStore(generation)) return;
      await handleSyncUpdateRpc(this.ctx, payload);
    });
  }
}
