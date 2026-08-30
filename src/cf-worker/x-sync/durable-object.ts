/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import { Clock, Effect, Layer, Logger, ManagedRuntime, Option } from "effect";

import type { XStatusResponse } from "../../lib/x-sync-status";
import { AuthClientLive } from "../auth/service";
import { Billing } from "../billing/service";
import { OrgId, UserId } from "../db/branded";
import { DbClientLive } from "../db/service";
import { maskId } from "../log-utils";
import { createLogger } from "../logger";
import type { Env } from "../shared";
import { OtelTracingLive } from "../tracing";
import { XSyncAccountRepository } from "./account";
import { pollReconciledEffect } from "./poll";
import type { PollOutcome } from "./poll";
import {
  healthyPollDelay,
  pollControlAfterSuccess,
  pollControlAfterTransientFailure,
  pollControlsEqual,
  rateLimitDelay,
  transientFailureDelay,
} from "./poll-control";
import {
  reconcileBeforePollEffect,
  reconcileSyncEffect,
  resumeSyncEffect,
} from "./reconcile";
import { XApiClient } from "./services";
import { LinkQueueClient } from "./services/link-queue-client";
import { LinkQueueClientLive } from "./services/link-queue-client.live";
import { XApiClientLive } from "./services/x-api-client.live";
import { XSyncAlarm } from "./services/x-sync-alarm";
import { XSyncStateStore } from "./services/x-sync-state-store";
import { XSyncStateStoreLive } from "./services/x-sync-state-store.live";

const XSyncLogger = createLogger("XBookmarkSyncDO");

export const X_API_CLIENT_TEST_OVERRIDE = Symbol(
  "@cloudstash/x-sync/XApiClientTestOverride"
);

export type { XStatusResponse } from "../../lib/x-sync-status";

const optionalOrgId = (value: string | undefined): OrgId | undefined => {
  if (!value) return undefined;
  return OrgId.make(value);
};

type AlarmOutcome =
  | { readonly kind: "halt" }
  | { readonly kind: "error" }
  | PollOutcome;

export class XBookmarkSyncDO extends DurableObject<Env> {
  // In-memory only — survives across alarms within a DO lifecycle, resets
  // to null on cold start. UI displays "—" briefly until the next alarm fires
  // (≤5m). Persisting this on every poll would burn DO write budget.
  private lastSyncedAt: number | null = null;
  private xApiClientLayer: Layer.Layer<XApiClient> = XApiClientLive;

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
    const accountLayer = XSyncAccountRepository.layer.pipe(
      Layer.provideMerge(Billing.layer),
      Layer.provideMerge(AuthClientLive(this.env)),
      Layer.provideMerge(DbClientLive(this.env.DB))
    );

    return Layer.mergeAll(
      this.xApiClientLayer,
      accountLayer,
      XSyncStateStoreLive(this.ctx.storage),
      XSyncAlarm.layer(this.ctx.storage),
      LinkQueueClientLive(this.env.LINK_QUEUE)
    ).pipe(
      Layer.provideMerge(OtelTracingLive),
      Layer.provideMerge(Logger.layer([XSyncLogger]))
    );
  }

  private runtime = ManagedRuntime.make(this.baseLayer);

  async [X_API_CLIENT_TEST_OVERRIDE](
    service: typeof XApiClient.Service
  ): Promise<void> {
    if (this.env.ENABLE_TEST_AUTH !== "true") {
      throw new Error("X API client overrides are disabled");
    }
    await this.runtime.dispose();
    this.xApiClientLayer = Layer.succeed(XApiClient, service);
    this.runtime = ManagedRuntime.make(this.baseLayer);
  }

  private runEffect<A, E>(
    effect: Effect.Effect<
      A,
      E,
      | XApiClient
      | XSyncStateStore
      | LinkQueueClient
      | XSyncAlarm
      | XSyncAccountRepository
    >
  ): Promise<A> {
    return this.runtime.runPromise(effect);
  }

  async start(): Promise<void> {
    await this.reconcile();
  }

  async reconcile(orgId?: string): Promise<void> {
    const userId = this.userId;
    return this.runEffect(reconcileSyncEffect(userId, optionalOrgId(orgId)));
  }

  async pause(): Promise<void> {
    await this.runEffect(this.pauseEffect(this.userId));
  }

  private pauseEffect = Effect.fn("XBookmarkSyncDO.pause")(
    { self: this },
    function* (this: XBookmarkSyncDO, userId: UserId) {
      yield* Effect.annotateCurrentSpan("userId", maskId(userId));
      yield* Effect.logInfo("pause").pipe(
        Effect.annotateLogs({ userId: maskId(userId) })
      );
      const store = yield* XSyncStateStore;
      const alarm = yield* XSyncAlarm;
      const state = yield* store.read();
      if (!state) return;
      yield* store.setSyncEnabled(false);
      yield* store.setStatus("paused");
      yield* alarm.cancel();
    }
  );

  async resume(orgId?: string): Promise<void> {
    await this.runEffect(resumeSyncEffect(this.userId, optionalOrgId(orgId)));
  }

  async disconnect(): Promise<void> {
    this.lastSyncedAt = null;
    await this.runEffect(this.disconnectEffect(this.ctx.id.name ?? "unknown"));
  }

  private disconnectEffect = Effect.fn("XBookmarkSyncDO.disconnect")(function* (
    userId: string
  ) {
    yield* Effect.annotateCurrentSpan("userId", maskId(userId));
    yield* Effect.logInfo("disconnect").pipe(
      Effect.annotateLogs({ userId: maskId(userId) })
    );
    const alarm = yield* XSyncAlarm;
    const store = yield* XSyncStateStore;
    yield* alarm.cancel();
    yield* store.clear();
  });

  async status(): Promise<XStatusResponse> {
    return this.runEffect(this.statusEffect(this.userId));
  }

  private statusEffect = Effect.fn("XBookmarkSyncDO.status")(
    { self: this },
    function* (this: XBookmarkSyncDO, userId: UserId) {
      yield* Effect.annotateCurrentSpan("userId", maskId(userId));
      const store = yield* XSyncStateStore;
      const state = yield* store.read();
      if (!state) return { connected: false } satisfies XStatusResponse;
      return {
        connected: true,
        xUsername: state.xUsername ?? undefined,
        status: state.status,
        syncEnabled: state.syncEnabled,
        lastSyncedAt: this.lastSyncedAt,
      } satisfies XStatusResponse;
    }
  );

  override async alarm(): Promise<void> {
    try {
      await this.runEffect(this.alarmEffect(this.userId));
    } finally {
      // Re-read D1 after external X/queue I/O. If the account was unlinked
      // while the alarm was running, normal reconciliation removes any local
      // state or alarm that the in-flight poll recreated.
      await this.reconcile();
    }
  }

  private pollAlarmEffect = Effect.fn("XBookmarkSyncDO.pollAlarm")(function* (
    userId: UserId
  ) {
    yield* Effect.annotateCurrentSpan("userId", maskId(userId));

    const reconciled = yield* reconcileBeforePollEffect(userId);
    if (Option.isNone(reconciled)) {
      yield* Effect.annotateCurrentSpan("outcome", "halt");
      yield* Effect.logInfo("alarm: reconciliation halted polling").pipe(
        Effect.annotateLogs({ userId: maskId(userId) })
      );
      return { kind: "halt" as const };
    }

    const ready = reconciled.value;
    return yield* pollReconciledEffect(
      userId,
      ready.organizationId,
      ready.state,
      ready.accessToken
    );
  });

  private resolveAlarmEffect = Effect.fn("XBookmarkSyncDO.resolveAlarm")(
    { self: this },
    function* (this: XBookmarkSyncDO, userId: UserId, outcome: AlarmOutcome) {
      if (outcome.kind === "halt") return;

      const store = yield* XSyncStateStore;
      const alarm = yield* XSyncAlarm;
      const current = yield* store.readPollControl();

      if (outcome.kind === "error") {
        const next = pollControlAfterTransientFailure(current);
        if (!pollControlsEqual(current, next)) {
          yield* store.setPollControl(next);
        }
        const delay = transientFailureDelay(next);
        yield* Effect.logWarning("alarm: backing off").pipe(
          Effect.annotateLogs({
            userId: maskId(userId),
            transientFailures: next.transientFailures,
            delayMs: delay,
          })
        );
        return yield* alarm.scheduleAfter(delay);
      }

      if (outcome.kind === "needs_reconnect") {
        return;
      }

      const now = yield* Clock.currentTimeMillis;
      if (outcome.kind === "rate_limited") {
        const rescheduleMs = rateLimitDelay(current, now, outcome.retryAfterMs);
        yield* Effect.logWarning("alarm: provider rate limited").pipe(
          Effect.annotateLogs({
            userId: maskId(userId),
            rescheduleMs,
          })
        );
        return yield* alarm.scheduleAfter(rescheduleMs);
      }

      const next = pollControlAfterSuccess(current, outcome.newCount, now);
      if (!pollControlsEqual(current, next)) {
        yield* store.setPollControl(next);
      }
      this.lastSyncedAt = now;
      const rescheduleMs = healthyPollDelay(next, now);
      yield* Effect.logDebug("alarm: rescheduled").pipe(
        Effect.annotateLogs({
          userId: maskId(userId),
          outcome: outcome.kind,
          newCount: outcome.newCount,
          rescheduleMs,
        })
      );
      return yield* alarm.scheduleAfter(rescheduleMs);
    }
  );

  private alarmEffect(userId: UserId) {
    return this.pollAlarmEffect(userId).pipe(
      Effect.catchTags({
        DbError: (e) =>
          Effect.logError("alarm: db error").pipe(
            Effect.annotateLogs({
              userId: maskId(userId),
              cause: String(e.cause),
            }),
            Effect.tap(() => Effect.annotateCurrentSpan("outcome", "error")),
            Effect.as({ kind: "error" as const })
          ),
        XSyncSideEffectError: (e) =>
          Effect.logError("alarm: side effect failed").pipe(
            Effect.annotateLogs({
              userId: maskId(userId),
              op: e.op,
              cause: String(e.cause),
            }),
            Effect.tap(() => Effect.annotateCurrentSpan("outcome", "error")),
            Effect.as({ kind: "error" as const })
          ),
        XSyncStorageError: (e) =>
          Effect.logError("alarm: storage error").pipe(
            Effect.annotateLogs({
              userId: maskId(userId),
              op: e.op,
              cause: String(e.cause),
            }),
            Effect.tap(() => Effect.annotateCurrentSpan("outcome", "error")),
            Effect.as({ kind: "error" as const })
          ),
        XApiError: (e) =>
          Effect.logError("alarm: X API error").pipe(
            Effect.annotateLogs({
              userId: maskId(userId),
              endpoint: e.endpoint,
              status: e.status,
              message: e.message,
            }),
            Effect.tap(() => Effect.annotateCurrentSpan("outcome", "error")),
            Effect.as({ kind: "error" as const })
          ),
      }),
      Effect.tap((outcome) =>
        Effect.annotateCurrentSpan("alarmOutcomeKind", outcome.kind)
      ),
      Effect.flatMap((outcome) => this.resolveAlarmEffect(userId, outcome)),
      Effect.withSpan("XBookmarkSyncDO.alarm")
    );
  }
}
