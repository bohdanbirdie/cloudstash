import { Context, Data, Effect, Layer } from "effect";

import { OrgId } from "../db/branded";
import { maskId } from "../log-utils";
import type { Env } from "../shared";

export class DigestScheduleReconcileError extends Data.TaggedError(
  "DigestScheduleReconcileError"
)<{ readonly cause: unknown; readonly orgId: OrgId }> {}

export class DigestScheduleReconciler extends Context.Service<
  DigestScheduleReconciler,
  {
    readonly reconcile: (
      orgId: OrgId
    ) => Effect.Effect<void, DigestScheduleReconcileError>;
  }
>()("@cloudstash/weekly-digest/DigestScheduleReconciler") {}

export const DigestScheduleReconcilerLive = (
  env: Pick<Env, "LINK_PROCESSOR_DO">
): Layer.Layer<DigestScheduleReconciler> =>
  Layer.succeed(DigestScheduleReconciler, {
    reconcile: Effect.fn("WeeklyDigest.reconcileSchedule")(function* (
      orgId: OrgId
    ) {
      yield* Effect.annotateCurrentSpan("orgId", maskId(orgId));
      const stub = env.LINK_PROCESSOR_DO.get(
        env.LINK_PROCESSOR_DO.idFromName(orgId)
      );
      yield* Effect.tryPromise({
        try: () => stub.ensureDigestScheduled(),
        catch: (cause) => new DigestScheduleReconcileError({ cause, orgId }),
      });
    }),
  });

export const reconcileDigestSchedule = Effect.fn(
  "WeeklyDigest.requestScheduleReconciliation"
)(function* (orgId: OrgId) {
  yield* Effect.annotateCurrentSpan("orgId", maskId(orgId));
  const reconciler = yield* DigestScheduleReconciler;
  yield* reconciler.reconcile(orgId);
});
