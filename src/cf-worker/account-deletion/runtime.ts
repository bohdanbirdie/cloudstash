import { Context, Data, Effect, Layer, Schema } from "effect";

import {
  isStripeResourceMissing,
  StripeClient,
  StripeClientLive,
} from "../billing/stripe-client";
import {
  OrgId,
  StripeSubscriptionId,
  UserId,
  WorkflowInstanceId,
} from "../db/branded";
import { maskId } from "../log-utils";
import type { Env } from "../shared";
import { TelegramKeyStore } from "../telegram/services";
import { TelegramKeyStoreLive } from "../telegram/services/telegram-key-store.live";
import { purgeTelegramForUser } from "./telegram";

export const AccountDeletionPayload = Schema.Struct({
  userId: UserId,
  orgId: OrgId,
  stripeSubscriptionId: Schema.NullOr(StripeSubscriptionId),
});

export type AccountDeletionParams = typeof AccountDeletionPayload.Type;

export const ACCOUNT_DELETION_RETENTION = {
  successRetention: "1 day",
  errorRetention: "3 days",
} as const satisfies NonNullable<
  WorkflowInstanceCreateOptions<AccountDeletionParams>["retention"]
>;

export interface WorkflowInstanceHandle {
  readonly id: WorkflowInstanceId;
}

export type DeletionRuntimeOp =
  | "retireLinkProcessor"
  | "retireSyncBackend"
  | "retireChatAgent"
  | "purgeTelegram"
  | "purgeXBookmarkSync"
  | "purgeEnrichmentUsage"
  | "cancelStripeSubscription"
  | "ensureWorkflow";

export type DeletionRuntimeStep = "status" | "restart" | "create";

export class DeletionRuntimeError extends Data.TaggedError(
  "DeletionRuntimeError"
)<{
  readonly op: DeletionRuntimeOp;
  readonly step?: DeletionRuntimeStep;
  readonly cause: unknown;
}> {
  override get message(): string {
    const op = this.step === undefined ? this.op : `${this.op}/${this.step}`;
    return `${op}: ${String(this.cause)}`;
  }
}

/**
 * The env seam: DO + Workflow bindings exposed as Effects so step bodies
 * compose without per-call Promise bridging. Tests provide
 * `Layer.succeed(DeletionRuntime, fakeImpl)`.
 */
export interface DeletionRuntimeShape {
  readonly retireLinkProcessor: (
    orgId: OrgId
  ) => Effect.Effect<void, DeletionRuntimeError>;
  readonly retireSyncBackend: (
    orgId: OrgId
  ) => Effect.Effect<void, DeletionRuntimeError>;
  readonly retireChatAgent: (
    orgId: OrgId
  ) => Effect.Effect<void, DeletionRuntimeError>;
  readonly purgeTelegram: (
    userId: UserId,
    orgId: OrgId
  ) => Effect.Effect<void, DeletionRuntimeError>;
  readonly purgeXBookmarkSync: (
    userId: UserId
  ) => Effect.Effect<void, DeletionRuntimeError>;
  readonly purgeEnrichmentUsage: (
    orgId: OrgId
  ) => Effect.Effect<void, DeletionRuntimeError>;
  readonly cancelStripeSubscription: (
    subscriptionId: StripeSubscriptionId,
    orgId: OrgId
  ) => Effect.Effect<void, DeletionRuntimeError>;
  readonly ensureWorkflow: (
    params: AccountDeletionParams
  ) => Effect.Effect<WorkflowInstanceHandle, DeletionRuntimeError>;
}

export class DeletionRuntime extends Context.Service<
  DeletionRuntime,
  DeletionRuntimeShape
>()("@cloudstash/DeletionRuntime") {}

const ACTIVE_WORKFLOW_STATUSES = new Set([
  "queued",
  "running",
  "paused",
  "waiting",
  "waitingForPause",
]);

const tryDO = <A>(
  op: DeletionRuntimeOp,
  thunk: () => Promise<A>
): Effect.Effect<A, DeletionRuntimeError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) => new DeletionRuntimeError({ op, cause }),
  });

export const DeletionRuntimeLayer = (env: Env) =>
  Layer.effect(
    DeletionRuntime,
    Effect.gen(function* () {
      const stripe = yield* StripeClient;
      const telegramKeyStore = yield* TelegramKeyStore;

      return DeletionRuntime.of({
        retireLinkProcessor: (orgId) =>
          tryDO("retireLinkProcessor", () =>
            env.LINK_PROCESSOR_DO.get(
              env.LINK_PROCESSOR_DO.idFromName(orgId)
            ).retire()
          ).pipe(
            Effect.withSpan("DeletionRuntime.retireLinkProcessor", {
              attributes: { orgId: maskId(orgId) },
            })
          ),
        retireSyncBackend: (orgId) =>
          tryDO("retireSyncBackend", () =>
            env.SYNC_BACKEND_DO.get(
              env.SYNC_BACKEND_DO.idFromName(orgId)
            ).retire()
          ).pipe(
            Effect.withSpan("DeletionRuntime.retireSyncBackend", {
              attributes: { orgId: maskId(orgId) },
            })
          ),
        retireChatAgent: (orgId) =>
          tryDO("retireChatAgent", () =>
            env.Chat.get(env.Chat.idFromName(orgId)).retire()
          ).pipe(
            Effect.withSpan("DeletionRuntime.retireChatAgent", {
              attributes: { orgId: maskId(orgId) },
            })
          ),
        purgeTelegram: (userId, orgId) =>
          purgeTelegramForUser({ userId, orgId }).pipe(
            Effect.asVoid,
            Effect.withSpan("DeletionRuntime.purgeTelegram", {
              attributes: { userId: maskId(userId), orgId: maskId(orgId) },
            }),
            Effect.provideService(TelegramKeyStore, telegramKeyStore)
          ),
        purgeXBookmarkSync: (userId) =>
          tryDO("purgeXBookmarkSync", () =>
            env.X_BOOKMARK_SYNC_DO.get(
              env.X_BOOKMARK_SYNC_DO.idFromName(userId)
            ).disconnect()
          ).pipe(
            Effect.withSpan("DeletionRuntime.purgeXBookmarkSync", {
              attributes: { userId: maskId(userId) },
            })
          ),
        purgeEnrichmentUsage: (orgId) =>
          Effect.gen(function* () {
            const prefix = `enrichment:${orgId}:`;
            let cursor: string | undefined;
            do {
              const page = yield* tryDO("purgeEnrichmentUsage", () =>
                env.ENRICHMENT_USAGE.list({ prefix, cursor })
              );
              yield* Effect.forEach(
                page.keys,
                (key) =>
                  tryDO("purgeEnrichmentUsage", () =>
                    env.ENRICHMENT_USAGE.delete(key.name)
                  ),
                { concurrency: 16, discard: true }
              );
              cursor = page.list_complete ? undefined : page.cursor;
            } while (cursor !== undefined);
          }).pipe(
            Effect.withSpan("DeletionRuntime.purgeEnrichmentUsage", {
              attributes: { orgId: maskId(orgId) },
            })
          ),
        cancelStripeSubscription: (subscriptionId, orgId) =>
          stripe
            .cancelSubscription({
              subscriptionId,
              idempotencyKey: `account-deletion:${orgId}`,
            })
            .pipe(
              Effect.asVoid,
              Effect.catchTag("StripeApiError", (cause) =>
                isStripeResourceMissing(cause)
                  ? Effect.logInfo("Stripe subscription already absent").pipe(
                      Effect.annotateLogs({
                        orgId: maskId(orgId),
                        subscriptionId: maskId(subscriptionId),
                      })
                    )
                  : Effect.fail(
                      new DeletionRuntimeError({
                        op: "cancelStripeSubscription",
                        cause,
                      })
                    )
              )
            ),
        ensureWorkflow: (params) =>
          Effect.gen(function* () {
            const instanceId = WorkflowInstanceId.make(params.orgId);
            // `createBatch` is explicitly idempotent: it creates a missing ID and
            // skips an existing retained instance. An empty result therefore
            // means "rejoin" without an exception-string race around get/create.
            const created = yield* Effect.tryPromise({
              try: () =>
                env.ACCOUNT_DELETION.createBatch([
                  {
                    id: instanceId,
                    params,
                    retention: ACCOUNT_DELETION_RETENTION,
                  },
                ]),
              catch: (cause) =>
                new DeletionRuntimeError({
                  op: "ensureWorkflow",
                  step: "create",
                  cause,
                }),
            });
            const instance =
              created[0] ??
              (yield* Effect.tryPromise({
                try: () => env.ACCOUNT_DELETION.get(instanceId),
                catch: (cause) =>
                  new DeletionRuntimeError({
                    op: "ensureWorkflow",
                    step: "status",
                    cause,
                  }),
              }));
            const status = yield* Effect.tryPromise({
              try: () => instance.status(),
              catch: (cause) =>
                new DeletionRuntimeError({
                  op: "ensureWorkflow",
                  step: "status",
                  cause,
                }),
            });

            if (
              ACTIVE_WORKFLOW_STATUSES.has(status.status) ||
              status.status === "complete"
            ) {
              return { id: WorkflowInstanceId.make(instance.id) };
            }
            if (status.status === "errored" || status.status === "terminated") {
              yield* Effect.tryPromise({
                try: () => instance.restart(),
                catch: (cause) =>
                  new DeletionRuntimeError({
                    op: "ensureWorkflow",
                    step: "restart",
                    cause,
                  }),
              });
              return { id: WorkflowInstanceId.make(instance.id) };
            }
            return yield* new DeletionRuntimeError({
              op: "ensureWorkflow",
              step: "status",
              cause: new Error(`Unsafe Workflow status: ${status.status}`),
            });
          }).pipe(
            Effect.withSpan("DeletionRuntime.ensureWorkflow", {
              attributes: { orgId: maskId(params.orgId) },
            })
          ),
      });
    })
  );

export const DeletionRuntimeLive = (env: Env) =>
  DeletionRuntimeLayer(env).pipe(
    Layer.provide(
      Layer.mergeAll(StripeClientLive(env), TelegramKeyStoreLive(env))
    )
  );
