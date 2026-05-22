import { Array as A, Context, Effect, Layer, Match, Option } from "effect";
import StripeSdk from "stripe";

import { PLAN_ORDER } from "@/lib/plan";
import type { PlanTier } from "@/lib/plan";

import {
  StripePriceId,
  StripeSubscriptionId,
  StripeSubscriptionItemId,
} from "../db/branded";
import type { StripeCustomerId } from "../db/branded";
import type { Env } from "../shared";
import { StripeApiError, WebhookVerificationError } from "./errors";

const API_VERSION = "2026-04-22.dahlia";

// `past_due` keeps access through Stripe's dunning retries; only a final
// canceled/unpaid drops to free.
export const ACTIVE_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "trialing",
  "past_due",
]);

// Stripe lists subscriptions newest-first, including dead ones. Prefer an
// active subscription over a newer canceled one; fall back to the newest.
export const selectSubscription = (
  subscriptions: readonly StripeSdk.Subscription[]
): Option.Option<StripeSdk.Subscription> =>
  A.findFirst(subscriptions, (s) =>
    ACTIVE_SUBSCRIPTION_STATUSES.has(s.status)
  ).pipe(Option.orElse(() => A.head(subscriptions)));

export interface CreateCustomerParams {
  readonly email?: string;
  readonly name?: string;
  readonly metadata: Record<string, string>;
  readonly idempotencyKey: string;
}

export interface CreateCheckoutParams {
  readonly customerId: StripeCustomerId;
  readonly priceId: StripePriceId;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly idempotencyKey: string;
}

// "pick" schedules the change at period end via the picker; "update" applies
// it immediately via a one-click confirm.
export type PortalFlow =
  | {
      readonly kind: "update";
      readonly subscriptionId: StripeSubscriptionId;
      readonly itemId: StripeSubscriptionItemId;
      readonly priceId: StripePriceId;
    }
  | { readonly kind: "pick"; readonly subscriptionId: StripeSubscriptionId }
  | { readonly kind: "cancel"; readonly subscriptionId: StripeSubscriptionId };

export interface CreatePortalParams {
  readonly customerId: StripeCustomerId;
  readonly returnUrl: string;
  readonly flow?: PortalFlow;
}

type PortalFlowData = NonNullable<
  StripeSdk.BillingPortal.SessionCreateParams["flow_data"]
>;

export const portalFlowData = (
  flow: PortalFlow | undefined,
  returnUrl: string
): PortalFlowData | undefined => {
  if (!flow) return undefined;
  const after_completion = {
    type: "redirect" as const,
    redirect: { return_url: returnUrl },
  };
  return Match.value(flow).pipe(
    Match.when({ kind: "update" }, (f) => ({
      type: "subscription_update_confirm" as const,
      subscription_update_confirm: {
        subscription: f.subscriptionId,
        items: [{ id: f.itemId, price: f.priceId, quantity: 1 }],
      },
      after_completion,
    })),
    Match.when({ kind: "pick" }, (f) => ({
      type: "subscription_update" as const,
      subscription_update: { subscription: f.subscriptionId },
      after_completion,
    })),
    Match.when({ kind: "cancel" }, (f) => ({
      type: "subscription_cancel" as const,
      subscription_cancel: { subscription: f.subscriptionId },
      after_completion,
    })),
    Match.exhaustive
  );
};

export interface StripeClientShape {
  readonly createCustomer: (
    params: CreateCustomerParams
  ) => Effect.Effect<StripeSdk.Customer, StripeApiError>;
  readonly createCheckoutSession: (
    params: CreateCheckoutParams
  ) => Effect.Effect<StripeSdk.Checkout.Session, StripeApiError>;
  readonly createPortalSession: (
    params: CreatePortalParams
  ) => Effect.Effect<StripeSdk.BillingPortal.Session, StripeApiError>;
  readonly listSubscriptions: (
    customerId: StripeCustomerId
  ) => Effect.Effect<readonly StripeSdk.Subscription[], StripeApiError>;
  readonly constructWebhookEvent: (
    payload: string,
    signature: string
  ) => Effect.Effect<
    StripeSdk.Event,
    WebhookVerificationError | StripeApiError
  >;
  readonly tierForPrice: (priceId: StripePriceId) => PlanTier | null;
  readonly priceForTier: (tier: PlanTier) => StripePriceId | null;
}

export class StripeClient extends Context.Tag("@cloudstash/StripeClient")<
  StripeClient,
  StripeClientShape
>() {}

export const decidePortalFlow = (
  subscription: StripeSdk.Subscription,
  targetTier: PlanTier,
  prices: Pick<StripeClientShape, "priceForTier" | "tierForPrice">
): PortalFlow | undefined => {
  const subscriptionId = StripeSubscriptionId.make(subscription.id);
  if (targetTier === "free") return { kind: "cancel", subscriptionId };

  const item = subscription.items.data[0];
  if (!item) return undefined;

  const currentPriceId = StripePriceId.make(item.price.id);
  const targetPrice = prices.priceForTier(targetTier);
  if (!targetPrice || currentPriceId === targetPrice) return undefined;

  const currentTier = prices.tierForPrice(currentPriceId);
  const isDowngrade =
    currentTier != null &&
    PLAN_ORDER.indexOf(targetTier) < PLAN_ORDER.indexOf(currentTier);

  return isDowngrade
    ? { kind: "pick", subscriptionId }
    : {
        kind: "update",
        subscriptionId,
        itemId: StripeSubscriptionItemId.make(item.id),
        priceId: targetPrice,
      };
};

const toStripeApiError = (cause: unknown): StripeApiError =>
  cause instanceof StripeSdk.errors.StripeError
    ? new StripeApiError({
        message: cause.message,
        code: cause.code,
        requestId: cause.requestId,
        cause,
      })
    : new StripeApiError({
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      });

export const StripeClientLive = (env: Env): Layer.Layer<StripeClient> =>
  Layer.sync(StripeClient, () => {
    // The default Node HTTP client fails on Workers even with nodejs_compat;
    // the fetch client is required.
    const stripe = new StripeSdk(env.STRIPE_API_KEY, {
      apiVersion: API_VERSION,
      httpClient: StripeSdk.createFetchHttpClient(),
    });

    const priceToTier = new Map<StripePriceId, PlanTier>([
      [StripePriceId.make(env.STRIPE_PRICE_PLUS), "plus"],
      [StripePriceId.make(env.STRIPE_PRICE_PRO), "pro"],
    ]);
    const tierToPrice: Record<PlanTier, StripePriceId | null> = {
      free: null,
      plus: StripePriceId.make(env.STRIPE_PRICE_PLUS),
      pro: StripePriceId.make(env.STRIPE_PRICE_PRO),
    };

    return StripeClient.of({
      createCustomer: Effect.fn("StripeClient.createCustomer")(function* (
        params: CreateCustomerParams
      ) {
        return yield* Effect.tryPromise({
          try: () =>
            stripe.customers.create(
              {
                email: params.email,
                name: params.name,
                metadata: params.metadata,
              },
              { idempotencyKey: params.idempotencyKey }
            ),
          catch: toStripeApiError,
        });
      }),

      createCheckoutSession: Effect.fn("StripeClient.createCheckoutSession")(
        function* (params: CreateCheckoutParams) {
          return yield* Effect.tryPromise({
            try: () =>
              stripe.checkout.sessions.create(
                {
                  mode: "subscription",
                  customer: params.customerId,
                  line_items: [{ price: params.priceId, quantity: 1 }],
                  success_url: params.successUrl,
                  cancel_url: params.cancelUrl,
                },
                { idempotencyKey: params.idempotencyKey }
              ),
            catch: toStripeApiError,
          });
        }
      ),

      createPortalSession: Effect.fn("StripeClient.createPortalSession")(
        function* (params: CreatePortalParams) {
          const flowData = portalFlowData(params.flow, params.returnUrl);
          return yield* Effect.tryPromise({
            try: () =>
              stripe.billingPortal.sessions.create({
                customer: params.customerId,
                return_url: params.returnUrl,
                ...(flowData ? { flow_data: flowData } : {}),
              }),
            catch: toStripeApiError,
          });
        }
      ),

      listSubscriptions: Effect.fn("StripeClient.listSubscriptions")(function* (
        customerId: StripeCustomerId
      ) {
        const page = yield* Effect.tryPromise({
          try: () =>
            stripe.subscriptions.list({
              customer: customerId,
              status: "all",
              limit: 10,
            }),
          catch: toStripeApiError,
        });
        return page.data;
      }),

      constructWebhookEvent: Effect.fn("StripeClient.constructWebhookEvent")(
        function* (payload: string, signature: string) {
          // constructEventAsync uses Web Crypto; the sync variant needs Node crypto.
          return yield* Effect.tryPromise({
            try: () =>
              stripe.webhooks.constructEventAsync(
                payload,
                signature,
                env.STRIPE_WEBHOOK_SECRET
              ),
            catch: (cause) =>
              cause instanceof StripeSdk.errors.StripeSignatureVerificationError
                ? new WebhookVerificationError({
                    message: cause.message,
                    cause,
                  })
                : toStripeApiError(cause),
          });
        }
      ),

      tierForPrice: (priceId: StripePriceId) =>
        priceToTier.get(priceId) ?? null,
      priceForTier: (tier: PlanTier) => tierToPrice[tier],
    });
  });
