import { Effect, Option, Schema } from "effect";

import { OrgId } from "../db/branded";
import type { Env } from "../shared";
import { Billing } from "./service";

export const ExternalCallAllowance = Schema.Struct({
  limit: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  resetsAt: Schema.String,
  usageWindowId: Schema.String,
});
export type ExternalCallAllowance = typeof ExternalCallAllowance.Type;

export class ExternalCallAllowanceUnavailableError extends Schema.TaggedErrorClass<ExternalCallAllowanceUnavailableError>()(
  "ExternalCallAllowanceUnavailableError",
  { orgId: OrgId }
) {}

export class ExternalCallLimitReachedError extends Schema.TaggedErrorClass<ExternalCallLimitReachedError>()(
  "ExternalCallLimitReachedError",
  {
    limit: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    orgId: OrgId,
    resetsAt: Schema.String,
  }
) {}

export class ExternalCallMeterError extends Schema.TaggedErrorClass<ExternalCallMeterError>()(
  "ExternalCallMeterError",
  {
    orgId: OrgId,
    cause: Schema.Defect(),
  }
) {}

export class ExternalCallWorkspaceUnavailableError extends Schema.TaggedErrorClass<ExternalCallWorkspaceUnavailableError>()(
  "ExternalCallWorkspaceUnavailableError",
  { orgId: OrgId }
) {}

export const externalCallAllowance = Effect.fn("Billing.externalCallAllowance")(
  function* (orgId: OrgId) {
    const billing = yield* Billing;
    const allowance = yield* billing.usageAllowance(orgId);
    return yield* Option.match(allowance.usageWindow, {
      onNone: () =>
        Effect.fail(new ExternalCallAllowanceUnavailableError({ orgId })),
      onSome: (window) =>
        Effect.succeed(
          ExternalCallAllowance.make({
            limit: allowance.capabilities.monthlyExternalCalls,
            resetsAt: window.resetsAt,
            usageWindowId: window.id,
          })
        ),
    });
  }
);

export const reserveExternalCallForAllowance = Effect.fn(
  "Billing.reserveExternalCallForAllowance"
)(function* (env: Env, orgId: OrgId, allowance: ExternalCallAllowance) {
  const processor = env.LINK_PROCESSOR_DO.get(
    env.LINK_PROCESSOR_DO.idFromName(orgId)
  );
  const reservation = yield* Effect.tryPromise({
    try: () =>
      processor.reserveExternalCall(allowance.usageWindowId, allowance.limit),
    catch: (cause) => new ExternalCallMeterError({ orgId, cause }),
  });
  if (reservation.status === "unavailable") {
    return yield* new ExternalCallWorkspaceUnavailableError({ orgId });
  }
  if (reservation.status === "limit_reached") {
    return yield* new ExternalCallLimitReachedError({
      limit: allowance.limit,
      orgId,
      resetsAt: allowance.resetsAt,
    });
  }
  return allowance;
});

export const reserveExternalCall = Effect.fn("Billing.reserveExternalCall")(
  function* (env: Env, orgId: OrgId) {
    const allowance = yield* externalCallAllowance(orgId);
    return yield* reserveExternalCallForAllowance(env, orgId, allowance);
  }
);
