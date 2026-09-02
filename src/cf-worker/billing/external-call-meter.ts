import { DateTime, Effect, Layer, Match, Option, Schema } from "effect";

import { OrgId } from "../db/branded";
import { DbClientLive } from "../db/service";
import { maskId, safeErrorInfo } from "../log-utils";
import type { Env } from "../shared";
import {
  refreshWorkspaceAllowance,
  workspaceAllowanceNeedsStripeRefresh,
} from "./assistant-allowance";
import { Billing } from "./service";
import { StripeClientLive } from "./stripe-client";
import { UsageReservation } from "./usage-meter";

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
) {
  override get message(): string {
    return "External call usage reservation failed";
  }
}

export class ExternalCallWorkspaceUnavailableError extends Schema.TaggedErrorClass<ExternalCallWorkspaceUnavailableError>()(
  "ExternalCallWorkspaceUnavailableError",
  { orgId: OrgId }
) {}

export const externalCallAllowance = Effect.fn("Billing.externalCallAllowance")(
  function* (env: Env, orgId: OrgId) {
    const billing = yield* Billing;
    const now = yield* DateTime.nowAsDate;
    const current = yield* billing.usageAllowance(orgId, now);
    const allowance = yield* Match.value(
      workspaceAllowanceNeedsStripeRefresh(current)
    ).pipe(
      Match.when(true, () =>
        refreshWorkspaceAllowance(orgId, current, now).pipe(
          Effect.catchTag("StripeApiError", (error) =>
            Effect.logError("External call usage cycle refresh failed").pipe(
              Effect.annotateLogs({
                orgId: maskId(orgId),
                ...safeErrorInfo(error),
              }),
              Effect.andThen(
                Effect.fail(
                  new ExternalCallAllowanceUnavailableError({ orgId })
                )
              )
            )
          ),
          Effect.provide(
            Layer.merge(DbClientLive(env.DB), StripeClientLive(env))
          )
        )
      ),
      Match.when(false, () => Effect.succeed(current)),
      Match.exhaustive
    );
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
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(UsageReservation)),
    Effect.mapError((cause) => new ExternalCallMeterError({ orgId, cause }))
  );
  yield* Effect.annotateCurrentSpan({
    orgId: maskId(orgId),
    "usage.count": reservation.count,
    "usage.limit": allowance.limit,
    "usage.status": reservation.status,
  });
  return yield* Match.value(reservation.status).pipe(
    Match.when("unavailable", () =>
      Effect.fail(new ExternalCallWorkspaceUnavailableError({ orgId }))
    ),
    Match.when("limit_reached", () =>
      Effect.fail(
        new ExternalCallLimitReachedError({
          limit: allowance.limit,
          orgId,
          resetsAt: allowance.resetsAt,
        })
      )
    ),
    Match.when("reserved", () => Effect.succeed(allowance)),
    Match.when("duplicate", () => Effect.succeed(allowance)),
    Match.exhaustive
  );
});

export const reserveExternalCall = Effect.fn("Billing.reserveExternalCall")(
  function* (env: Env, orgId: OrgId) {
    const allowance = yield* externalCallAllowance(env, orgId);
    return yield* reserveExternalCallForAllowance(env, orgId, allowance);
  }
);
