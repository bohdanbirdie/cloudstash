/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import { Effect, Layer, Logger, Match } from "effect";

import { AppLayerLive, AuthClient } from "../auth/service";
import { UserId, XUserId, XUsername } from "../db/branded";
import { DbClient } from "../db/service";
import { createLogger } from "../logger";
import type { Env } from "../shared";
import {
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  POLL_INTERVAL_MS,
  getAccessTokenEffect,
  initializeWatermarkEffect,
  pollOnceEffect,
} from "./effects";
import type { PollOutcome } from "./effects";
import { sideEffectError } from "./effects-helpers";
import { XApiClient } from "./services";
import { LinkQueueClient } from "./services/link-queue-client";
import { LinkQueueClientLive } from "./services/link-queue-client.live";
import { XApiClientLive } from "./services/x-api-client.live";
import type { Status } from "./services/x-sync-state-store";
import { XSyncStateStore } from "./services/x-sync-state-store";
import { XSyncStateStoreLive } from "./services/x-sync-state-store.live";

const XSyncLogger = createLogger("XBookmarkSyncDO");

export interface XStatusResponse {
  connected: boolean;
  xUsername?: XUsername;
  status?: Status;
  syncEnabled?: boolean;
  lastSyncedAt?: number | null;
}

const isAlarmTerminal = (o: {
  kind: "halt" | "fatal" | "error" | "result";
  result?: PollOutcome;
}): o is { kind: "halt" | "fatal" } => o.kind === "halt" || o.kind === "fatal";

export class XBookmarkSyncDO extends DurableObject<Env> {
  private retryAttempt = 0;

  // In-memory only — survives across alarms within a DO lifecycle, resets
  // to null on cold start. UI displays "—" briefly until the next alarm fires
  // (≤30s). Persisting this on every poll would burn DO write budget.
  private lastSyncedAt: number | null = null;

  // Overridable seam for tests; defaults to the real X API client.
  protected xApiLayer: Layer.Layer<XApiClient> = XApiClientLive;

  private get userId(): UserId {
    const name = this.ctx.id.name;
    if (!name) {
      throw new Error(
        "XBookmarkSyncDO must be addressed via idFromName(userId)"
      );
    }
    return UserId.make(name);
  }

  private get baseLayer() {
    return Layer.mergeAll(
      this.xApiLayer,
      XSyncStateStoreLive(this.ctx.storage),
      LinkQueueClientLive(this.env.LINK_QUEUE)
    ).pipe(
      Layer.provideMerge(AppLayerLive(this.env)),
      Layer.provideMerge(Logger.replace(Logger.defaultLogger, XSyncLogger))
    );
  }

  private runEffect<A, E>(
    effect: Effect.Effect<
      A,
      E,
      XApiClient | XSyncStateStore | LinkQueueClient | AuthClient | DbClient
    >
  ): Promise<A> {
    return effect.pipe(Effect.provide(this.baseLayer), Effect.runPromise);
  }

  /**
   * Called from the connect callback after the X account is linked.
   * Fetches the X user identity, pins the watermark to the current head
   * (so existing bookmarks are NOT imported — cost safety), and arms the
   * alarm. Idempotent: re-running on an already-connected DO refreshes
   * identity but preserves the existing watermark.
   */
  async start(): Promise<void> {
    const userId = this.userId;
    await this.runEffect(this.startEffect(userId));
  }

  private startEffect = Effect.fn("XBookmarkSyncDO.start")((userId: UserId) =>
    Effect.gen(this, function* () {
      yield* Effect.annotateCurrentSpan("userId", userId);
      const store = yield* XSyncStateStore;

      const existing = yield* store
        .get()
        .pipe(
          Effect.catchTag("XSyncStorageError", (e) =>
            Effect.logWarning("start: storage get failed").pipe(
              Effect.annotateLogs({ userId, op: e.op, cause: String(e.cause) }),
              Effect.as(null)
            )
          )
        );

      const accessToken = yield* getAccessTokenEffect(userId);
      if (!accessToken) {
        yield* Effect.logWarning("start: no access token, halting").pipe(
          Effect.annotateLogs({ userId })
        );
        return;
      }

      const api = yield* XApiClient;
      const me = yield* api.getMe(accessToken).pipe(
        Effect.catchTags({
          XUnauthorizedError: (e) =>
            store.setStatus("needs_reconnect").pipe(
              Effect.catchTag("XSyncStorageError", () => Effect.void),
              Effect.tap(() =>
                Effect.logWarning("start: getMe 401, needs reconnect").pipe(
                  Effect.annotateLogs({ userId, endpoint: e.endpoint })
                )
              ),
              Effect.as(null)
            ),
          XApiError: (e) =>
            Effect.logError("start: getMe failed").pipe(
              Effect.annotateLogs({
                userId,
                endpoint: e.endpoint,
                status: e.status,
                message: e.message,
              }),
              Effect.as(null)
            ),
        })
      );
      if (!me) return;

      yield* store
        .setIdentity({
          xUserId: XUserId.make(me.id),
          xUsername: XUsername.make(me.username),
        })
        .pipe(
          Effect.catchTag("XSyncStorageError", (e) =>
            Effect.logError("start: setIdentity failed, halting").pipe(
              Effect.annotateLogs({ userId, op: e.op, cause: String(e.cause) })
            )
          )
        );

      const isFreshConnect = !existing?.watermarkTweetId;
      yield* Effect.annotateCurrentSpan("isFreshConnect", isFreshConnect);
      yield* Effect.logInfo("start").pipe(
        Effect.annotateLogs({ userId, isFreshConnect })
      );
      if (isFreshConnect) {
        yield* initializeWatermarkEffect(userId);
      }

      yield* Effect.tryPromise({
        try: () => this.ctx.storage.setAlarm(Date.now() + POLL_INTERVAL_MS),
        catch: sideEffectError("storage.setAlarm"),
      }).pipe(Effect.catchTag("XSyncSideEffectError", () => Effect.void));
    })
  );

  async pause(): Promise<void> {
    await this.runEffect(this.pauseEffect(this.userId));
  }

  private pauseEffect = Effect.fn("XBookmarkSyncDO.pause")((userId: UserId) =>
    Effect.gen(this, function* () {
      yield* Effect.annotateCurrentSpan("userId", userId);
      yield* Effect.logInfo("pause").pipe(Effect.annotateLogs({ userId }));
      const store = yield* XSyncStateStore;
      yield* store
        .setSyncEnabled(false)
        .pipe(Effect.catchTag("XSyncStorageError", () => Effect.void));
      yield* Effect.tryPromise({
        try: () => this.ctx.storage.deleteAlarm(),
        catch: sideEffectError("storage.deleteAlarm"),
      }).pipe(Effect.catchTag("XSyncSideEffectError", () => Effect.void));
    })
  );

  async resume(): Promise<void> {
    this.retryAttempt = 0;
    await this.runEffect(this.resumeEffect(this.userId));
  }

  private resumeEffect = Effect.fn("XBookmarkSyncDO.resume")((userId: UserId) =>
    Effect.gen(this, function* () {
      yield* Effect.annotateCurrentSpan("userId", userId);
      yield* Effect.logInfo("resume").pipe(Effect.annotateLogs({ userId }));
      const store = yield* XSyncStateStore;
      yield* store
        .setSyncEnabled(true)
        .pipe(Effect.catchTag("XSyncStorageError", () => Effect.void));
      yield* store
        .setStatus("active")
        .pipe(Effect.catchTag("XSyncStorageError", () => Effect.void));
      yield* Effect.tryPromise({
        try: () => this.ctx.storage.setAlarm(Date.now() + POLL_INTERVAL_MS),
        catch: sideEffectError("storage.setAlarm"),
      }).pipe(Effect.catchTag("XSyncSideEffectError", () => Effect.void));
    })
  );

  async disconnect(): Promise<void> {
    this.lastSyncedAt = null;
    await this.runEffect(this.disconnectEffect(this.ctx.id.name ?? "unknown"));
  }

  private disconnectEffect = Effect.fn("XBookmarkSyncDO.disconnect")(
    (userId: string) =>
      Effect.gen(this, function* () {
        yield* Effect.annotateCurrentSpan("userId", userId);
        yield* Effect.logInfo("disconnect").pipe(
          Effect.annotateLogs({ userId })
        );
        yield* Effect.tryPromise({
          try: () => this.ctx.storage.deleteAlarm(),
          catch: sideEffectError("storage.deleteAlarm"),
        }).pipe(Effect.catchTag("XSyncSideEffectError", () => Effect.void));
        yield* Effect.tryPromise({
          try: () => this.ctx.storage.deleteAll(),
          catch: sideEffectError("storage.deleteAll"),
        }).pipe(Effect.catchTag("XSyncSideEffectError", () => Effect.void));
      })
  );

  async status(): Promise<XStatusResponse> {
    return this.runEffect(this.statusEffect(this.userId));
  }

  private statusEffect = Effect.fn("XBookmarkSyncDO.status")((userId: UserId) =>
    Effect.gen(this, function* () {
      yield* Effect.annotateCurrentSpan("userId", userId);
      const store = yield* XSyncStateStore;
      const state = yield* store
        .get()
        .pipe(
          Effect.catchTag("XSyncStorageError", (e) =>
            Effect.logWarning("status: storage get failed").pipe(
              Effect.annotateLogs({ userId, op: e.op, cause: String(e.cause) }),
              Effect.as(null)
            )
          )
        );
      if (!state) return { connected: false } satisfies XStatusResponse;
      return {
        connected: true,
        xUsername: state.xUsername,
        status: state.status,
        syncEnabled: state.syncEnabled,
        lastSyncedAt: this.lastSyncedAt,
      } satisfies XStatusResponse;
    })
  );

  override async alarm(): Promise<void> {
    const userId = this.userId;

    const outcome = await this.runEffect(this.alarmEffect(userId));

    if (isAlarmTerminal(outcome)) {
      return;
    }

    if (outcome.kind === "error") {
      this.retryAttempt += 1;
      const delay = Math.min(
        BACKOFF_BASE_MS * 2 ** (this.retryAttempt - 1),
        BACKOFF_CAP_MS
      );
      await this.runEffect(
        Effect.logWarning("alarm: backing off").pipe(
          Effect.annotateLogs({
            userId,
            retryAttempt: this.retryAttempt,
            delayMs: delay,
          })
        )
      );
      await this.ctx.storage.setAlarm(Date.now() + delay);
      return;
    }

    const { result } = outcome;
    if (
      result.kind === "needs_reconnect" ||
      result.kind === "not_initialized"
    ) {
      return;
    }
    this.retryAttempt = 0;
    this.lastSyncedAt = Date.now();
    const rescheduleMs =
      result.kind === "rate_limited"
        ? result.retryAfterMs
        : result.rescheduleInMs;
    await this.runEffect(
      Effect.logInfo("alarm: rescheduled").pipe(
        Effect.annotateLogs({
          userId,
          outcome: result.kind,
          rescheduleMs,
        })
      )
    );
    await this.ctx.storage.setAlarm(Date.now() + rescheduleMs);
  }

  private alarmEffect = Effect.fn("XBookmarkSyncDO.alarm")((userId: UserId) =>
    Effect.gen(this, function* () {
      yield* Effect.annotateCurrentSpan("userId", userId);
      yield* Effect.annotateCurrentSpan("retryAttempt", this.retryAttempt);

      const store = yield* XSyncStateStore;
      const state = yield* store
        .get()
        .pipe(
          Effect.catchTag("XSyncStorageError", (e) =>
            Effect.logWarning("alarm: storage get failed").pipe(
              Effect.annotateLogs({ userId, op: e.op, cause: String(e.cause) }),
              Effect.as(null)
            )
          )
        );
      if (!state) {
        yield* Effect.annotateCurrentSpan("outcome", "halt");
        yield* Effect.logWarning("alarm: no state, halting").pipe(
          Effect.annotateLogs({ userId })
        );
        return { kind: "halt" as const };
      }
      if (!state.syncEnabled || state.status !== "active") {
        yield* Effect.annotateCurrentSpan("outcome", "halt");
        yield* Effect.logInfo("alarm: sync disabled/inactive, halting").pipe(
          Effect.annotateLogs({
            userId,
            status: state.status,
            syncEnabled: state.syncEnabled,
          })
        );
        return { kind: "halt" as const };
      }

      return yield* pollOnceEffect(userId).pipe(
        Effect.map(
          (r: PollOutcome) => ({ kind: "result" as const, result: r }) as const
        ),
        Effect.catchTags({
          NoAccessTokenError: () =>
            Effect.logWarning("alarm: fatal — no access token, halting").pipe(
              Effect.annotateLogs({ userId }),
              Effect.tap(() => Effect.annotateCurrentSpan("outcome", "fatal")),
              Effect.as({ kind: "fatal" as const })
            ),
          DbError: (e) =>
            Effect.logError("alarm: db error").pipe(
              Effect.annotateLogs({ userId, cause: String(e.cause) }),
              Effect.tap(() => Effect.annotateCurrentSpan("outcome", "error")),
              Effect.as({ kind: "error" as const })
            ),
          XApiError: (e) =>
            Effect.logError("alarm: X API error").pipe(
              Effect.annotateLogs({
                userId,
                endpoint: e.endpoint,
                status: e.status,
                message: e.message,
              }),
              Effect.tap(() => Effect.annotateCurrentSpan("outcome", "error")),
              Effect.as({ kind: "error" as const })
            ),
        })
      );
    }).pipe(
      // Surface the chosen outcome kind on the parent span. Match keeps it
      // exhaustive across the discriminated union (which uses `kind`, not `_tag`).
      Effect.tap((o) =>
        Effect.annotateCurrentSpan(
          "alarmOutcomeKind",
          Match.value(o).pipe(
            Match.discriminators("kind")({
              halt: () => "halt",
              fatal: () => "fatal",
              error: () => "error",
              result: (r) => `result:${r.result.kind}`,
            }),
            Match.exhaustive
          )
        )
      )
    )
  );
}
