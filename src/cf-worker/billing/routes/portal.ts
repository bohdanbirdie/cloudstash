import { Effect, Option } from "effect";

import { maskId } from "../../log-utils";
import type { Env } from "../../shared";
import {
  decidePortalFlow,
  selectSubscription,
  StripeClient,
} from "../stripe-client";
import { getOrCreateStripeCustomer } from "../stripe-sync";
import {
  dbErrorResponse,
  forbidden,
  invalidBodyResponse,
  sessionErrorTags,
  stripeErrorResponse,
} from "./responses";
import { isCrossSite, runBilling } from "./runtime";
import { appBaseUrl, decodeBody, PortalBody, requireOrg } from "./shared";

const portalRequest = Effect.fn("Billing.portal")(function* (
  request: Request,
  env: Env
) {
  const { orgId } = yield* requireOrg(request.headers);
  const body = yield* decodeBody(request, PortalBody);
  const stripe = yield* StripeClient;

  const customerId = yield* getOrCreateStripeCustomer(orgId);
  // Eager-sync endpoint, not /welcome: a portal action otherwise only syncs via the webhook.
  const returnUrl = `${appBaseUrl(request, env)}/api/stripe/success`;

  const subscriptions = yield* stripe.listSubscriptions(customerId);
  const flow = Option.match(selectSubscription(subscriptions), {
    onNone: () => undefined,
    onSome: (subscription) => decidePortalFlow(subscription, body.tier, stripe),
  });

  const session = yield* stripe.createPortalSession({
    customerId,
    returnUrl,
    flow,
  });

  yield* Effect.annotateCurrentSpan({
    orgId: maskId(orgId),
    tier: body.tier,
    flow: flow?.kind ?? "home",
  });
  return Response.json({ url: session.url });
});

export const handleBillingPortal = (
  request: Request,
  env: Env
): Promise<Response> => {
  if (isCrossSite(request)) return Promise.resolve(forbidden());
  return runBilling(
    portalRequest(request, env).pipe(
      Effect.catchTags({
        ...sessionErrorTags,
        InvalidBodyError: invalidBodyResponse,
        StripeApiError: stripeErrorResponse,
        DbError: dbErrorResponse,
      })
    ),
    env
  );
};
