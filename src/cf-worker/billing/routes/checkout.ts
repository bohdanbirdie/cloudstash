import { Effect } from "effect";

import { maskId } from "../../log-utils";
import type { Env } from "../../shared";
import { StripeConfigError } from "../errors";
import { StripeClient } from "../stripe-client";
import { getOrCreateStripeCustomer } from "../stripe-sync";
import {
  configErrorResponse,
  dbErrorResponse,
  forbidden,
  invalidBodyResponse,
  sessionErrorTags,
  stripeErrorResponse,
} from "./responses";
import { isCrossSite, runBilling } from "./runtime";
import { appBaseUrl, CheckoutBody, decodeBody, requireOrg } from "./shared";

const checkoutRequest = Effect.fn("Billing.checkout")(function* (
  request: Request,
  env: Env
) {
  const { orgId } = yield* requireOrg(request.headers);
  const body = yield* decodeBody(request, CheckoutBody);

  yield* Effect.annotateCurrentSpan({
    orgId: maskId(orgId),
    tier: body.tier,
    interval: body.interval,
  });
  const stripe = yield* StripeClient;

  const priceId = stripe.priceForTier(body.tier, body.interval);
  if (!priceId) {
    return yield* new StripeConfigError({
      message: `no price configured for tier ${body.tier} (${body.interval})`,
      tier: body.tier,
      interval: body.interval,
    });
  }

  const customerId = yield* getOrCreateStripeCustomer(orgId);
  const base = appBaseUrl(request, env);
  const idempotencyKey = yield* Effect.sync(() => crypto.randomUUID());

  const session = yield* stripe
    .createCheckoutSession({
      customerId,
      priceId,
      successUrl: `${base}/api/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/inbox?upgrade=1`,
      idempotencyKey,
    })
    .pipe(
      Effect.tapErrorTag("StripeApiError", (error) =>
        Effect.annotateCurrentSpan({
          stripeCode: error.code ?? "unknown",
          stripeRequestId: error.requestId ?? "unknown",
        })
      )
    );

  yield* Effect.annotateCurrentSpan({ sessionId: maskId(session.id) });
  yield* Effect.logInfo("Checkout session created");

  return Response.json({ url: session.url });
});

export const checkoutProgram = (request: Request, env: Env) =>
  checkoutRequest(request, env).pipe(
    Effect.catchTags({
      ...sessionErrorTags,
      InvalidBodyError: invalidBodyResponse,
      StripeConfigError: configErrorResponse,
      StripeApiError: stripeErrorResponse,
      DbError: dbErrorResponse,
    })
  );

export const handleBillingCheckout = (
  request: Request,
  env: Env
): Promise<Response> => {
  if (isCrossSite(request)) return Promise.resolve(forbidden());
  return runBilling(checkoutProgram(request, env), env);
};
