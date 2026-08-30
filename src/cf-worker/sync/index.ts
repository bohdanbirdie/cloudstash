import type { CfTypes } from "@livestore/sync-cf/cf-worker";
import * as SyncBackend from "@livestore/sync-cf/cf-worker";
import { Effect } from "effect";

import { AppLayerLive } from "../auth/service";
import { OrgId } from "../db/branded";
import { maskId, safeErrorInfo } from "../log-utils";
import { logSync } from "../logger";
import type { Env } from "../shared";
import { OtelTracingLive } from "../tracing";
import type { PushEvent } from "./activity";
import { recordActivity } from "./record-activity";

export { runSyncAuth, validatePayload } from "./validate-payload";

const logger = logSync("SyncBackend");

// TEMP — production verification for effect v4's timer-less `Effect.never`
// (formerly the deleted patches/effect@3.21.2.patch). A pending long-period
// timer — setInterval or setTimeout, the v4 runtime may use either — is the
// exact disqualifier for Cloudflare Durable Object WebSocket hibernation; a
// timer-less `Effect.never` registers none, so this count must stay 0 on every
// live connection. We warn loudly if any long-period timer is ever created and
// surface the running count on the "Push received" log, so prod can be confirmed
// by querying the whale's pushes for `liveLongTimers: 0`. Remove once confirmed.
let liveLongTimers = 0;
{
  const HIBERNATION_TIMER_MS = 1_000_000;
  type IntervalFn = typeof globalThis.setInterval;
  type TimeoutFn = typeof globalThis.setTimeout;
  type TimerId = ReturnType<IntervalFn>;
  const realSetInterval: IntervalFn = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  const realSetTimeout: TimeoutFn = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const longTimerIds = new Set<TimerId>();
  const untrack = (id: TimerId): void => {
    if (longTimerIds.delete(id)) {
      liveLongTimers = longTimerIds.size;
    }
  };
  const track = (id: TimerId, kind: string, msDelay?: number): void => {
    longTimerIds.add(id);
    liveLongTimers = longTimerIds.size;
    logger.warn(`[hibernation-timer] long-period ${kind} created`, {
      msDelay,
      liveLongTimers,
    });
  };
  const wrappedSetInterval = (
    callback: (...cbArgs: unknown[]) => void,
    msDelay?: number,
    ...args: unknown[]
  ): TimerId => {
    const id: TimerId = realSetInterval(callback, msDelay, ...args);
    if ((msDelay ?? 0) > HIBERNATION_TIMER_MS) {
      track(id, "setInterval", msDelay);
    }
    return id;
  };
  const wrappedSetTimeout = (
    callback: (...cbArgs: unknown[]) => void,
    msDelay?: number,
    ...args: unknown[]
  ): TimerId => {
    if ((msDelay ?? 0) > HIBERNATION_TIMER_MS) {
      const id: TimerId = realSetTimeout(
        (...cbArgs: unknown[]) => {
          untrack(id);
          callback(...cbArgs);
        },
        msDelay,
        ...args
      );
      track(id, "setTimeout", msDelay);
      return id;
    }
    return realSetTimeout(callback, msDelay, ...args);
  };
  const wrappedClearInterval = (id?: TimerId): void => {
    if (id !== undefined) untrack(id);
    realClearInterval(id);
  };
  const wrappedClearTimeout = (id?: TimerId): void => {
    if (id !== undefined) untrack(id);
    realClearTimeout(id);
  };
  globalThis.setInterval = wrappedSetInterval as IntervalFn;
  globalThis.setTimeout = wrappedSetTimeout as TimeoutFn;
  globalThis.clearInterval =
    wrappedClearInterval as typeof globalThis.clearInterval;
  globalThis.clearTimeout =
    wrappedClearTimeout as typeof globalThis.clearTimeout;
}

let currentSyncBackend: {
  storeId: string | undefined;
  triggerLinkProcessor: (storeId: OrgId) => void;
  getEventlogMax: () => number | null;
  recordActivity: (storeId: OrgId, batch: readonly PushEvent[]) => void;
} | null = null;

// Stuck-LP tripwire: if a push's first parentSeqNum is more than
// STUCK_GAP_THRESHOLD events behind SB's eventlog max, the client is far
// behind — likely the sync-stall bug or a future variant. Log only for now.
// Heal/alert wiring is the follow-up in docs/todos/admin-server-ahead-alert.md.
const STUCK_GAP_THRESHOLD = 100;

export class SyncBackendDO extends SyncBackend.makeDurableObject({
  onPush: async (message, context) => {
    const storeId = OrgId.make(context.storeId);
    logger.info("Push received", {
      storeId: maskId(storeId),
      batchSize: message.batch.length,
      events: message.batch.map((e) => e.name),
      liveLongTimers,
    });

    const shouldWakeProcessor = message.batch.some(
      (event) =>
        event.name === "v1.LinkCreated" ||
        event.name === "v2.LinkCreated" ||
        event.name === "v1.LinkReprocessRequested"
    );
    if (shouldWakeProcessor && currentSyncBackend) {
      currentSyncBackend.triggerLinkProcessor(storeId);
    }

    if (currentSyncBackend) {
      currentSyncBackend.recordActivity(storeId, message.batch);
    }

    const firstParent = message.batch[0]?.parentSeqNum;
    // getEventlogMax reads this instance's own SQLite, but instances of one
    // class share an isolate and the singleton holds whichever was constructed
    // last. Only compare when that instance owns the store being pushed.
    if (firstParent !== undefined && currentSyncBackend?.storeId === storeId) {
      const sbMax = currentSyncBackend.getEventlogMax();
      if (sbMax !== null && sbMax - firstParent > STUCK_GAP_THRESHOLD) {
        logger.warn("LP push lags SB eventlog — possible stuck client", {
          storeId: maskId(storeId),
          lpParent: firstParent,
          sbMax,
          gap: sbMax - firstParent,
        });
      }
    }
  },
}) {
  private _env: Env;
  private _ctx: CfTypes.DurableObjectState;
  // Cached once the eventlog table is created (livestore creates it on first
  // push). Stays undefined until then; we re-lookup on each call until found.
  private _eventlogTable: string | undefined;
  readonly storeId: string | undefined;

  constructor(ctx: CfTypes.DurableObjectState, env: Env) {
    super(ctx, env);
    this._env = env;
    this._ctx = ctx;
    this.storeId = ctx.id.name;
    currentSyncBackend = this;
    logger.info("DO woke up", { doId: ctx.id.toString() });
  }

  getEventlogMax(): number | null {
    try {
      if (this._eventlogTable === undefined) {
        const tables = this._ctx.storage.sql
          .exec(
            "SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'eventlog_*'"
          )
          .toArray() as Array<{ name: string }>;
        this._eventlogTable = tables[0]?.name;
      }
      if (this._eventlogTable === undefined) return null;
      const row = this._ctx.storage.sql
        .exec(`SELECT MAX(seqNum) as max FROM "${this._eventlogTable}"`)
        .one() as { max: number | null } | undefined;
      return row?.max ?? null;
    } catch {
      return null;
    }
  }

  /** Closes active clients and wipes the canonical eventlog. */
  async purgeAll(): Promise<void> {
    for (const socket of this._ctx.getWebSockets()) {
      socket.close(1001, "Eventlog purged");
    }
    await Effect.runPromise(
      Effect.gen({ self: this }, function* () {
        yield* Effect.promise(() => this._ctx.storage.deleteAll());
        yield* Effect.logInfo("purgeAll: storage wiped").pipe(
          Effect.annotateLogs({ doId: this._ctx.id.toString() })
        );
      }).pipe(
        Effect.withSpan("SyncBackendDO.purgeAll"),
        Effect.provide(OtelTracingLive)
      )
    );
  }

  recordActivity(storeId: OrgId, batch: readonly PushEvent[]) {
    recordActivity(this._env, storeId, batch);
  }

  triggerLinkProcessor(storeId: OrgId) {
    const env = this._env;
    const trigger = Effect.fn("SyncBackendDO.triggerLinkProcessor")(
      function* () {
        yield* Effect.logInfo("Waking up processor").pipe(
          Effect.annotateLogs({ storeId: maskId(storeId) })
        );
        const processorId = env.LINK_PROCESSOR_DO.idFromName(storeId);
        const processor = env.LINK_PROCESSOR_DO.get(processorId);
        yield* Effect.tryPromise({
          try: () =>
            processor.fetch(`https://link-processor/?storeId=${storeId}`),
          catch: (cause) => ({ _tag: "ProcessorFetchError" as const, cause }),
        });
        yield* Effect.logInfo("Processor fetch succeeded");
      }
    );
    Effect.runFork(
      trigger().pipe(
        Effect.tapError((e) =>
          Effect.logError("Processor fetch failed").pipe(
            Effect.annotateLogs(safeErrorInfo(e.cause))
          )
        ),
        Effect.catch(() => Effect.void),
        Effect.provide(AppLayerLive(env))
      )
    );
  }
}

type SyncSearchParams = NonNullable<
  ReturnType<typeof SyncBackend.matchSyncRequest>
>;

export const handleSyncRequest = (
  request: CfTypes.Request,
  searchParams: SyncSearchParams,
  ctx: CfTypes.ExecutionContext,
  _env: Env
) =>
  SyncBackend.handleSyncRequest({
    ctx,
    request,
    searchParams,
    syncBackendBinding: "SYNC_BACKEND_DO",
    // Auth already ran in runSyncAuth() upstream; this no-op anchors the
    // generic TSyncPayload to `unknown` so type inference stays shallow.
    validatePayload: (_payload: unknown) => {},
  });

export { SyncBackend };
