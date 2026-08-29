import { Effect, Match, Option } from "effect";

import type { OrgId } from "../db/branded";
import { maskId } from "../log-utils";
import { Billing } from "./service";
import { getStripeCustomerId, syncFromStripe } from "./stripe-sync";

/**
 * Resolve the Assistant entitlement and its stable usage window. Existing
 * Stripe accounts created before cycle fields existed are refreshed once;
 * subsequent reads use the persisted Stripe state without another API call.
 */
export const resolveAssistantAllowance = Effect.fn(
  "Billing.resolveAssistantAllowance"
)(function* (orgId: OrgId, now = new Date()) {
  const billing = yield* Billing;
  const current = yield* billing.assistantAllowance(orgId, now);
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
        Effect.andThen(billing.assistantAllowance(orgId, now)),
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
