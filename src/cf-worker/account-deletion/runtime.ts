import { Context, Effect, Layer, Match, Option, Schema } from "effect";

import type { OrgId, UserId } from "../db/branded";
import { WorkflowInstanceId } from "../db/branded";
import type { Env } from "../shared";
import { TelegramKeyStoreLive } from "../telegram/services/telegram-key-store.live";
import { purgeTelegramForUser } from "./telegram";

export interface AccountDeletionParams {
  userId: UserId;
  orgId: OrgId;
}

export interface WorkflowInstanceHandle {
  readonly id: WorkflowInstanceId;
}

export class DeletionRuntimeError extends Schema.TaggedError<DeletionRuntimeError>()(
  "DeletionRuntimeError",
  {
    op: Schema.Literal(
      "markLinkProcessorDeleting",
      "purgeLinkProcessor",
      "purgeSyncBackend",
      "purgeChatAgent",
      "purgeTelegram",
      "purgeXBookmarkSync",
      "ensureWorkflow"
    ),
    step: Schema.optional(Schema.Literal("status", "restart", "create")),
    cause: Schema.Defect,
  }
) {}

/**
 * The env seam: DO + Workflow bindings exposed as Effects so step bodies
 * compose without per-call Promise bridging. Tests provide
 * `Layer.succeed(DeletionRuntime, fakeImpl)`.
 */
export class DeletionRuntime extends Context.Tag("@cloudstash/DeletionRuntime")<
  DeletionRuntime,
  {
    readonly markLinkProcessorDeleting: (
      orgId: OrgId
    ) => Effect.Effect<void, DeletionRuntimeError>;
    readonly purgeLinkProcessor: (
      orgId: OrgId
    ) => Effect.Effect<void, DeletionRuntimeError>;
    readonly purgeSyncBackend: (
      orgId: OrgId
    ) => Effect.Effect<void, DeletionRuntimeError>;
    readonly purgeChatAgent: (
      orgId: OrgId
    ) => Effect.Effect<void, DeletionRuntimeError>;
    readonly purgeTelegram: (
      userId: UserId,
      orgId: OrgId
    ) => Effect.Effect<void, DeletionRuntimeError>;
    readonly purgeXBookmarkSync: (
      userId: UserId
    ) => Effect.Effect<void, DeletionRuntimeError>;
    readonly ensureWorkflow: (
      params: AccountDeletionParams
    ) => Effect.Effect<WorkflowInstanceHandle, DeletionRuntimeError>;
  }
>() {}

const isStatusActive = (status: string): boolean =>
  Match.value(status).pipe(
    Match.whenOr(
      "queued",
      "running",
      "paused",
      "waiting",
      "waitingForPause",
      () => true
    ),
    Match.orElse(() => false)
  );

const tryDO = <A>(
  op: DeletionRuntimeError["op"],
  thunk: () => Promise<A>
): Effect.Effect<A, DeletionRuntimeError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) => new DeletionRuntimeError({ op, cause }),
  });

export const DeletionRuntimeLive = (env: Env) =>
  Layer.succeed(
    DeletionRuntime,
    DeletionRuntime.of({
      markLinkProcessorDeleting: (orgId) =>
        tryDO("markLinkProcessorDeleting", () =>
          env.LINK_PROCESSOR_DO.get(
            env.LINK_PROCESSOR_DO.idFromName(orgId)
          ).markDeleting()
        ).pipe(
          Effect.withSpan("DeletionRuntime.markLinkProcessorDeleting", {
            attributes: { orgId },
          })
        ),
      purgeLinkProcessor: (orgId) =>
        tryDO("purgeLinkProcessor", () =>
          env.LINK_PROCESSOR_DO.get(
            env.LINK_PROCESSOR_DO.idFromName(orgId)
          ).purgeAll()
        ).pipe(
          Effect.withSpan("DeletionRuntime.purgeLinkProcessor", {
            attributes: { orgId },
          })
        ),
      purgeSyncBackend: (orgId) =>
        tryDO("purgeSyncBackend", () =>
          env.SYNC_BACKEND_DO.get(
            env.SYNC_BACKEND_DO.idFromName(orgId)
          ).purgeAll()
        ).pipe(
          Effect.withSpan("DeletionRuntime.purgeSyncBackend", {
            attributes: { orgId },
          })
        ),
      purgeChatAgent: (orgId) =>
        tryDO("purgeChatAgent", () =>
          env.Chat.get(env.Chat.idFromName(orgId)).purgeAll()
        ).pipe(
          Effect.withSpan("DeletionRuntime.purgeChatAgent", {
            attributes: { orgId },
          })
        ),
      purgeTelegram: (userId, orgId) =>
        // TelegramKeyStore provided inline so the Tag method's R stays `never`.
        purgeTelegramForUser({ userId, orgId }).pipe(
          Effect.asVoid,
          Effect.withSpan("DeletionRuntime.purgeTelegram", {
            attributes: { userId, orgId },
          }),
          Effect.provide(TelegramKeyStoreLive(env))
        ),
      purgeXBookmarkSync: (userId) =>
        tryDO("purgeXBookmarkSync", () =>
          env.X_BOOKMARK_SYNC_DO.get(
            env.X_BOOKMARK_SYNC_DO.idFromName(userId)
          ).disconnect()
        ).pipe(
          Effect.withSpan("DeletionRuntime.purgeXBookmarkSync", {
            attributes: { userId },
          })
        ),
      ensureWorkflow: (params) =>
        Effect.gen(function* () {
          // orgId IS the workflow instance id. `get(orgId)` is the
          // idempotency check; CF throws on unknown id with a message that
          // varies across environments (e.g. local wrangler emits literal
          // "instance.not_found"). Rather than string-sniff, treat ANY
          // get-failure as "no existing instance" and fall through to
          // `create()`. If the failure was actually transient (rate-limit,
          // auth), `create()` will surface the real error — preserving the
          // load-bearing failure mode while removing the brittle heuristic.
          const existing = yield* Effect.tryPromise(() =>
            env.ACCOUNT_DELETION.get(params.orgId)
          ).pipe(Effect.option);

          if (Option.isSome(existing)) {
            const instance = existing.value;
            const status = yield* Effect.tryPromise({
              try: () => instance.status(),
              catch: (cause) =>
                new DeletionRuntimeError({
                  op: "ensureWorkflow",
                  step: "status",
                  cause,
                }),
            });
            if (isStatusActive(status.status)) {
              return { id: WorkflowInstanceId.make(instance.id) };
            }
            // Terminal within retention — restart with the same id.
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

          const fresh = yield* Effect.tryPromise({
            try: () =>
              env.ACCOUNT_DELETION.create({ id: params.orgId, params }),
            catch: (cause) =>
              new DeletionRuntimeError({
                op: "ensureWorkflow",
                step: "create",
                cause,
              }),
          });
          return { id: WorkflowInstanceId.make(fresh.id) };
        }).pipe(
          Effect.withSpan("DeletionRuntime.ensureWorkflow", {
            attributes: { orgId: params.orgId },
          })
        ),
    })
  );
