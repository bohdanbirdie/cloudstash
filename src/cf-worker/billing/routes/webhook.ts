import { Effect, Option, Schema } from "effect";
import type StripeSdk from "stripe";

import { StripeCustomerId } from "../../db/branded";
import { maskId, safeErrorInfo } from "../../log-utils";
import type { Env } from "../../shared";
import { enqueueOrgXReconcile } from "../../x-sync/reconcile-triggers";
import { WebhookVerificationError } from "../errors";
import { StripeClient } from "../stripe-client";
import { syncFromStripe } from "../stripe-sync";
import { dbErrorResponse, json, stripeErrorResponse } from "./responses";
import { runBilling } from "./runtime";

// Events that can change an org's tier. `syncFromStripe` re-derives state from
// the live subscription on each, so anything outside this set (e.g.
// billing_portal.session.created) is acked without a Stripe round-trip.
const RELEVANT_EVENTS: ReadonlySet<string> = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

const CustomerRef = Schema.Union([
  Schema.String,
  Schema.Struct({ id: Schema.String }),
]);
const CustomerObject = Schema.Struct({
  customer: Schema.optionalKey(CustomerRef),
});

const customerIdFromRef = (ref: typeof CustomerRef.Type): StripeCustomerId => {
  if (typeof ref === "string") return StripeCustomerId.make(ref);
  return StripeCustomerId.make(ref.id);
};

export const extractCustomerId = (
  event: StripeSdk.Event
): StripeCustomerId | null =>
  Schema.decodeUnknownOption(CustomerObject)(event.data.object).pipe(
    Option.flatMap(({ customer }) => Option.fromNullishOr(customer)),
    Option.map(customerIdFromRef),
    Option.getOrNull
  );

const webhookRequest = Effect.fn("Billing.webhook")(function* (
  request: Request
) {
  const stripe = yield* StripeClient;
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return yield* new WebhookVerificationError({
      message: "missing stripe-signature header",
    });
  }
  const payload = yield* Effect.promise(() => request.text());
  const event = yield* stripe.constructWebhookEvent(payload, signature);

  yield* Effect.annotateCurrentSpan({ eventType: event.type });

  if (!RELEVANT_EVENTS.has(event.type)) {
    return Response.json({ received: true });
  }

  const customerId = extractCustomerId(event);
  if (!customerId) {
    yield* Effect.logInfo("Billing.webhook: event has no customer").pipe(
      Effect.annotateLogs({ eventType: event.type })
    );
    return Response.json({ received: true });
  }

  yield* Effect.annotateCurrentSpan({ customerId: maskId(customerId) });

  // Not caught: a sync failure surfaces as 5xx so Stripe retries delivery.
  const orgId = yield* syncFromStripe(customerId);
  if (orgId) {
    yield* enqueueOrgXReconcile(orgId);
  }
  return Response.json({ received: true });
});

export const webhookProgram = (request: Request) =>
  webhookRequest(request).pipe(
    Effect.catchTags({
      WebhookVerificationError: (cause) =>
        Effect.logWarning(
          "Billing.webhook: signature verification failed"
        ).pipe(
          Effect.annotateLogs({ message: cause.message }),
          Effect.as(json(400, "Invalid signature"))
        ),
      StripeApiError: stripeErrorResponse,
      DbError: dbErrorResponse,
      XReconcileQueueError: (error) =>
        Effect.logError(
          "Billing.webhook: X reconciliation enqueue failed"
        ).pipe(
          Effect.annotateLogs(safeErrorInfo(error)),
          Effect.as(json(500, "Internal server error"))
        ),
    })
  );

export const handleStripeWebhook = (
  request: Request,
  env: Env
): Promise<Response> => runBilling(webhookProgram(request), env);
