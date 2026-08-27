/// <reference types="@cloudflare/workers-types" />
import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";

import {
  AccountDeletionPayload,
  DeletionRuntimeLive,
} from "../account-deletion/runtime";
import type { AccountDeletionParams } from "../account-deletion/runtime";
import { ACCOUNT_DELETION_STEPS } from "../account-deletion/workflow";
import { DbClientLive } from "../db/service";
import { maskId, safeErrorInfo } from "../log-utils";
import type { Env } from "../shared";
import { OtelTracingLive } from "../tracing";

export type { AccountDeletionParams };
export { ACCOUNT_DELETION_STEPS } from "../account-deletion/workflow";

const DeletionWorkflowLive = (env: Env) =>
  Layer.mergeAll(
    DbClientLive(env.DB),
    DeletionRuntimeLive(env),
    OtelTracingLive
  );

export class AccountDeletionWorkflow extends WorkflowEntrypoint<
  Env,
  AccountDeletionParams
> {
  override async run(
    event: WorkflowEvent<AccountDeletionParams>,
    step: WorkflowStep
  ): Promise<void> {
    const runtime = ManagedRuntime.make(DeletionWorkflowLive(this.env));

    try {
      const payload = await runtime.runPromise(
        Schema.decodeUnknownEffect(AccountDeletionPayload)(event.payload)
      );
      // Keep orchestration native: Cloudflare persists each step and owns its
      // retries/timeouts; each callback is one Effect activity whose failure
      // rejects the Promise and therefore remains retryable.
      const traceAttributes = {
        workflowInstanceId: maskId(event.instanceId),
        orgId: maskId(payload.orgId),
        userId: maskId(payload.userId),
      };
      for (const definition of ACCOUNT_DELETION_STEPS) {
        await step.do(definition.name, definition.config, () =>
          runtime.runPromise(
            definition
              .activity(payload)
              .pipe(Effect.annotateSpans(traceAttributes))
          )
        );
      }
    } catch (error) {
      await runtime.runPromise(
        Effect.logError("AccountDeletionWorkflow failed").pipe(
          Effect.annotateLogs({
            instanceId: maskId(event.instanceId),
            ...safeErrorInfo(error),
          })
        )
      );
      throw error;
    } finally {
      await runtime.dispose();
    }
  }
}
