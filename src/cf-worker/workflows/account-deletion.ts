/// <reference types="@cloudflare/workers-types" />
import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { Cause, Effect, Layer, Schema } from "effect";

import type { AccountDeletionParams } from "../account-deletion/runtime";
import type { CfWorkflowStep } from "../account-deletion/workflow";
import { CfStep, runAccountDeletion } from "../account-deletion/workflow";
import { AppLayerLive } from "../auth/service";
import { OrgId, UserId } from "../db/branded";
import type { Env } from "../shared";

export type { AccountDeletionParams };

/**
 * Cloudflare serializes `params` as JSON between create() and run() — brands
 * are erased at the wire boundary. Decode (not just .make) so a malformed
 * payload fails loudly here instead of silently propagating fake brands.
 */
const PayloadSchema = Schema.Struct({
  userId: UserId,
  orgId: OrgId,
});

export class AccountDeletionWorkflow extends WorkflowEntrypoint<
  Env,
  AccountDeletionParams
> {
  override async run(
    event: WorkflowEvent<AccountDeletionParams>,
    step: WorkflowStep
  ): Promise<void> {
    // Single structural cast — CF's `WorkflowStep` uses `Serializable<T>` /
    // `WorkflowSleepDuration` template-literal types that don't widen to our
    // looser `CfWorkflowStep` interface. Runtime values are identical.
    const cfStep = step as unknown as CfWorkflowStep;
    await Effect.runPromise(
      Schema.decodeUnknown(PayloadSchema)(event.payload).pipe(
        Effect.flatMap(runAccountDeletion),
        Effect.tapErrorCause((cause) =>
          Effect.logError("AccountDeletionWorkflow failed").pipe(
            Effect.annotateLogs({ cause: Cause.pretty(cause) })
          )
        ),
        Effect.provide(
          Layer.mergeAll(Layer.succeed(CfStep, cfStep), AppLayerLive(this.env))
        )
      )
    );
  }
}
