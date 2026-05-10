import { eq } from "drizzle-orm";
import { Context, Effect, Runtime, Schema } from "effect";

import * as schema from "../db/schema";
import { DbClient, query } from "../db/service";
import type { AccountDeletionParams } from "./runtime";
import { DeletionRuntime } from "./runtime";

const STEP_RETRY = {
  retries: { limit: 5, delay: "10 seconds", backoff: "exponential" },
  timeout: "1 minute",
} as const;

interface StepRetryOptions {
  retries: { limit: number; delay: string; backoff: string };
  timeout: string;
}

/**
 * Subset of Cloudflare's `WorkflowStep` we depend on. A duck-typed mock can
 * be provided in tests (no `cloudflare:workers` import). The production
 * entry point widens the real `WorkflowStep` to this shape with a single,
 * documented cast — CF's `Serializable<T>` and `WorkflowSleepDuration`
 * template-literal types don't structurally match a looser local interface,
 * but our payloads (void / branded strings / D1 rows) are JSON-serializable
 * at runtime.
 */
export interface CfWorkflowStep {
  do<T>(name: string, fn: () => Promise<T>): Promise<T>;
  do<T>(
    name: string,
    options: StepRetryOptions,
    fn: () => Promise<T>
  ): Promise<T>;
}

/**
 * Per-invocation dependency: the `step` argument CF passes to `run()`. We
 * provide it via `Layer.succeed(CfStep, step)` at the workflow entry point
 * so the orchestration is a plain `Effect.gen` — no `step` argument
 * threading, no Promise plumbing inside step bodies.
 */
export class CfStep extends Context.Tag("@cloudstash/CfStep")<
  CfStep,
  CfWorkflowStep
>() {}

/**
 * A specific step inside the orchestration failed (after CF's own retries).
 * `cause` preserves the original throwable; `step` is the human-readable name.
 */
export class WorkflowOrchestrationError extends Schema.TaggedError<WorkflowOrchestrationError>()(
  "WorkflowOrchestrationError",
  {
    step: Schema.String,
    cause: Schema.Defect,
  }
) {}

/**
 * We do NOT route the body through `Effect.either` because that would resolve
 * the Promise even on failure, defeating CF's per-step retry semantics
 * (configured via `STEP_RETRY`). Failure must reject the Promise for CF to
 * retry; `cause: Defect` preserves the original `_tag` + fields for triage.
 */
export const step = <A, E, R>(
  name: string,
  body: Effect.Effect<A, E, R>,
  options?: StepRetryOptions
): Effect.Effect<A, WorkflowOrchestrationError, R | CfStep> =>
  Effect.gen(function* () {
    const cf = yield* CfStep;
    const rt = yield* Effect.runtime<R>();
    // CF's `do<T>` callback is `(ctx) => Promise<Serializable<T>>`. Our `T`
    // is always JSON-serializable at runtime; the cast is the single bridge.
    const fn = (() => Runtime.runPromise(rt)(body)) as never;
    return yield* Effect.tryPromise({
      try: () => (options ? cf.do<A>(name, options, fn) : cf.do<A>(name, fn)),
      catch: (cause) => new WorkflowOrchestrationError({ step: name, cause }),
    }).pipe(
      Effect.withSpan(`AccountDeletion.step.${name}`, {
        attributes: { step: name },
      })
    );
  });

const deleteOrg = Effect.fn("AccountDeletion.deleteOrg")(function* (
  orgId: AccountDeletionParams["orgId"]
) {
  yield* Effect.annotateCurrentSpan({ orgId });
  const db = yield* DbClient;
  yield* query(
    db.delete(schema.organization).where(eq(schema.organization.id, orgId))
  );
});

/**
 * `purge-telegram` runs late so a TELEGRAM_KV outage can't delay the critical
 * D1/DO wipes — the apikey FK cascade blocks bot authn the moment delete-org
 * runs anyway.
 */
export const runAccountDeletion = Effect.fn("AccountDeletion.runWorkflow")(
  function* (payload: AccountDeletionParams) {
    const runtime = yield* DeletionRuntime;
    const { userId, orgId } = payload;

    yield* Effect.annotateCurrentSpan({ userId, orgId });
    yield* Effect.logInfo("Workflow started").pipe(
      Effect.annotateLogs({ userId, orgId })
    );

    yield* step(
      "mark-link-processor-deleting",
      runtime.markLinkProcessorDeleting(orgId),
      STEP_RETRY
    );
    yield* step(
      "wipe-link-processor",
      runtime.purgeLinkProcessor(orgId),
      STEP_RETRY
    );
    yield* step(
      "wipe-sync-backend",
      runtime.purgeSyncBackend(orgId),
      STEP_RETRY
    );
    yield* step("wipe-chat-agent", runtime.purgeChatAgent(orgId), STEP_RETRY);
    yield* step(
      "purge-telegram",
      runtime.purgeTelegram(userId, orgId),
      STEP_RETRY
    );
    yield* step("delete-org", deleteOrg(orgId), STEP_RETRY);

    yield* Effect.logInfo("Workflow complete").pipe(
      Effect.annotateLogs({ userId, orgId })
    );
  }
);
