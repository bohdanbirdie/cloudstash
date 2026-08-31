import { DateTime, Effect, Match, Option } from "effect";

import type { OrgId } from "../db/branded";
import { maskId } from "../log-utils";
import { Billing } from "./service";
import { getStripeCustomerId, syncFromStripe } from "./stripe-sync";

const hasMonthlyAllowance = (capabilities: {
  readonly monthlyAiSummaries: number;
  readonly monthlyAssistantCredits: number;
  readonly monthlyExternalCalls: number;
  readonly monthlyXBookmarks: number;
  readonly monthlyXEnrichments: number;
}) =>
  capabilities.monthlyAiSummaries > 0 ||
  capabilities.monthlyAssistantCredits > 0 ||
  capabilities.monthlyExternalCalls > 0 ||
  capabilities.monthlyXBookmarks > 0 ||
  capabilities.monthlyXEnrichments > 0;

export const resolveWorkspaceAllowance = Effect.fn(
  "Billing.resolveWorkspaceAllowance"
)(function* (orgId: OrgId, now?: Date) {
  const billing = yield* Billing;
  const effectiveNow = now ?? (yield* DateTime.nowAsDate);
  const current = yield* billing.usageAllowance(orgId, effectiveNow);
  const needsStripeRefresh =
    current.source === "stripe" &&
    hasMonthlyAllowance(current.capabilities) &&
    Option.isNone(current.usageWindow);

  if (!needsStripeRefresh) return current;

  const customerId = yield* getStripeCustomerId(orgId);
  return yield* Option.match(customerId, {
    onNone: () =>
      Effect.logWarning("Workspace usage cycle cannot be refreshed").pipe(
        Effect.annotateLogs({ orgId: maskId(orgId), reason: "no_customer" }),
        Effect.as(current)
      ),
    onSome: (id) =>
      syncFromStripe(id).pipe(
        Effect.andThen(billing.usageAllowance(orgId, effectiveNow)),
        Effect.tap((refreshed) =>
          Match.value(Option.isSome(refreshed.usageWindow)).pipe(
            Match.when(true, () => Effect.void),
            Match.when(false, () =>
              Effect.logWarning(
                "Workspace usage cycle is unavailable after refresh"
              ).pipe(Effect.annotateLogs({ orgId: maskId(orgId) }))
            ),
            Match.exhaustive
          )
        )
      ),
  });
});

/**
 * Resolve the Assistant entitlement and its stable usage window. Existing
 * Stripe accounts created before cycle fields existed are refreshed once;
 * subsequent reads use the persisted Stripe state without another API call.
 */
export const resolveAssistantAllowance = Effect.fn(
  "Billing.resolveAssistantAllowance"
)(function* (orgId: OrgId, now?: Date) {
  const billing = yield* Billing;
  const effectiveNow = now ?? (yield* DateTime.nowAsDate);
  const current = yield* billing.assistantAllowance(orgId, effectiveNow);
  const needsStripeRefresh =
    current.source === "stripe" &&
    current.capabilities.chatAgent &&
    Option.isNone(current.usageWindow);

  if (!needsStripeRefresh) return current;

  const customerId = yield* getStripeCustomerId(orgId);
  return yield* Option.match(customerId, {
    onNone: () =>
      Effect.logWarning("Assistant Stripe cycle cannot be refreshed").pipe(
        Effect.annotateLogs({ orgId: maskId(orgId), reason: "no_customer" }),
        Effect.as(current)
      ),
    onSome: (id) =>
      syncFromStripe(id).pipe(
        Effect.andThen(billing.assistantAllowance(orgId, effectiveNow)),
        Effect.tap((refreshed) =>
          Match.value(Option.isSome(refreshed.usageWindow)).pipe(
            Match.when(true, () => Effect.void),
            Match.when(false, () =>
              Effect.logWarning(
                "Assistant Stripe cycle is unavailable after refresh"
              ).pipe(Effect.annotateLogs({ orgId: maskId(orgId) }))
            ),
            Match.exhaustive
          )
        )
      ),
  });
});
