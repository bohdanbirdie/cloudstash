import type { CfTypes } from "@livestore/sync-cf/cf-worker";
import * as SyncBackend from "@livestore/sync-cf/cf-worker";
import { Effect } from "effect";

import { AppLayerLive, AuthClient } from "../auth/service";
import { OrgId } from "../db/branded";
import { maskId, safeErrorInfo } from "../log-utils";
import { logSync } from "../logger";
import type { Env } from "../shared";
import { OtelTracingLive } from "../tracing";
import {
  InvalidSessionError,
  MissingSessionCookieError,
  OrgAccessDeniedError,
} from "./errors";

const logger = logSync("SyncBackend");

// Current SyncBackendDO instance - set in constructor so it's always available
let currentSyncBackend: {
  triggerLinkProcessor: (storeId: string) => void;
  getEventlogMax: () => number | null;
} | null = null;

// Stuck-LP tripwire: if a push's first parentSeqNum is more than
// STUCK_GAP_THRESHOLD events behind SB's eventlog max, the client is far
// behind — likely the sync-stall bug or a future variant. Log only for now.
// Heal/alert wiring is the follow-up in docs/todos/admin-server-ahead-alert.md.
const STUCK_GAP_THRESHOLD = 100;

export class SyncBackendDO extends SyncBackend.makeDurableObject({
  onPush: async (message, context) => {
    logger.info("Push received", {
      storeId: context.storeId,
      batchSize: message.batch.length,
      events: message.batch.map((e) => e.name),
    });

    const shouldWakeProcessor = message.batch.some(
      (event) =>
        event.name === "v1.LinkCreated" ||
        event.name === "v2.LinkCreated" ||
        event.name === "v1.LinkReprocessRequested"
    );
    if (shouldWakeProcessor && currentSyncBackend) {
      currentSyncBackend.triggerLinkProcessor(context.storeId);
    }

    const firstParent = message.batch[0]?.parentSeqNum;
    if (firstParent !== undefined && currentSyncBackend) {
      const sbMax = currentSyncBackend.getEventlogMax();
      if (sbMax !== null && sbMax - firstParent > STUCK_GAP_THRESHOLD) {
        logger.warn("LP push lags SB eventlog — possible stuck client", {
          storeId: maskId(context.storeId),
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

  constructor(ctx: CfTypes.DurableObjectState, env: Env) {
    super(ctx, env);
    this._env = env;
    this._ctx = ctx;
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

  /**
   * Wipes all DO storage (including Livestore eventlog). Called by
   * AccountDeletionWorkflow during account deletion.
   */
  async purgeAll(): Promise<void> {
    await Effect.runPromise(
      Effect.gen(this, function* () {
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

  triggerLinkProcessor(storeId: string) {
    logger.info("Waking up processor", { storeId: maskId(storeId) });
    const processorId = this._env.LINK_PROCESSOR_DO.idFromName(storeId);
    const processor = this._env.LINK_PROCESSOR_DO.get(processorId);
    processor
      .fetch(`https://link-processor/?storeId=${storeId}`)
      .then(() => logger.info("Processor fetch succeeded"))
      .catch((error: unknown) =>
        logger.error("Processor fetch failed", safeErrorInfo(error))
      );
  }
}

const validatePayload = Effect.fn("Sync.validatePayload")(function* (
  _payload: unknown,
  context: { storeId: string; headers: ReadonlyMap<string, string> }
) {
  const auth = yield* AuthClient;
  const cookie = context.headers.get("cookie");
  if (!cookie) {
    yield* Effect.logWarning("Sync auth failed: missing cookie").pipe(
      Effect.annotateLogs({ storeId: maskId(context.storeId) })
    );
    return yield* new MissingSessionCookieError();
  }

  const session = yield* Effect.tryPromise({
    catch: () => new InvalidSessionError(),
    try: () => auth.api.getSession({ headers: new Headers({ cookie }) }),
  });

  if (!session?.session) {
    yield* Effect.logWarning("Sync auth failed: invalid session").pipe(
      Effect.annotateLogs({ storeId: maskId(context.storeId) })
    );
    return yield* new InvalidSessionError();
  }

  if (session.session.activeOrganizationId !== context.storeId) {
    yield* Effect.logWarning("Sync auth failed: org mismatch").pipe(
      Effect.annotateLogs({
        storeId: maskId(context.storeId),
        sessionOrgId: maskId(session.session.activeOrganizationId ?? "none"),
      })
    );
    return yield* new OrgAccessDeniedError({
      sessionOrgId: session.session.activeOrganizationId
        ? OrgId.make(session.session.activeOrganizationId)
        : null,
      storeId: OrgId.make(context.storeId),
    });
  }

  yield* Effect.logDebug("Sync auth OK").pipe(
    Effect.annotateLogs({ storeId: maskId(context.storeId) })
  );
});

type SyncSearchParams = NonNullable<
  ReturnType<typeof SyncBackend.matchSyncRequest>
>;

export const handleSyncRequest = (
  request: CfTypes.Request,
  searchParams: SyncSearchParams,
  ctx: CfTypes.ExecutionContext,
  env: Env
) =>
  SyncBackend.handleSyncRequest({
    ctx,
    request,
    searchParams,
    syncBackendBinding: "SYNC_BACKEND_DO",
    validatePayload: (payload, context) =>
      validatePayload(payload, context).pipe(
        Effect.provide(AppLayerLive(env)),
        Effect.runPromise
      ),
  });

export { SyncBackend };
