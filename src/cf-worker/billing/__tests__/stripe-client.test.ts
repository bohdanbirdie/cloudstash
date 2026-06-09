import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import type StripeSdk from "stripe";

import type { BillingInterval, PlanTier } from "@/lib/plan";

import { StripePriceId } from "../../db/branded";
import type { Env } from "../../shared";
import {
  decidePortalFlow,
  portalFlowData,
  selectSubscription,
  StripeClient,
  StripeClientLive,
} from "../stripe-client";

const sub = (
  status: string,
  opts: {
    id?: string;
    priceId?: string;
    itemId?: string;
    noItems?: boolean;
    cancelAtPeriodEnd?: boolean;
    periodEnd?: number;
    interval?: BillingInterval;
  } = {}
): StripeSdk.Subscription =>
  ({
    id: opts.id ?? "sub_1",
    status,
    cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
    items: {
      data: opts.noItems
        ? []
        : [
            {
              id: opts.itemId ?? "si_1",
              price: {
                id: opts.priceId ?? "price_plus",
                recurring: { interval: opts.interval ?? "month" },
              },
              current_period_end: opts.periodEnd ?? 1_700_000_000,
            },
          ],
    },
  }) as unknown as StripeSdk.Subscription;

const prices = {
  priceForTier: (
    t: PlanTier,
    interval: BillingInterval
  ): StripePriceId | null => {
    if (t === "plus")
      return StripePriceId.make(
        interval === "year" ? "price_plus_yearly" : "price_plus"
      );
    if (t === "pro")
      return StripePriceId.make(
        interval === "year" ? "price_pro_yearly" : "price_pro"
      );
    return null;
  },
  tierForPrice: (id: string): PlanTier | null =>
    id === "price_plus" || id === "price_plus_yearly"
      ? "plus"
      : id === "price_pro" || id === "price_pro_yearly"
        ? "pro"
        : null,
};

describe("selectSubscription", () => {
  it("returns none for an empty list", () => {
    expect(Option.isNone(selectSubscription([]))).toBe(true);
  });

  it("prefers an active subscription over a newer canceled one", () => {
    // Stripe lists newest-first; the canceled one is newer.
    const result = selectSubscription([
      sub("canceled", { id: "sub_new" }),
      sub("active", { id: "sub_active" }),
    ]);
    expect(Option.getOrNull(result)?.id).toBe("sub_active");
  });

  it("falls back to the newest when none are active", () => {
    const result = selectSubscription([
      sub("canceled", { id: "sub_new" }),
      sub("incomplete_expired", { id: "sub_old" }),
    ]);
    expect(Option.getOrNull(result)?.id).toBe("sub_new");
  });

  it("treats trialing and past_due as active", () => {
    expect(
      Option.getOrNull(selectSubscription([sub("trialing", { id: "t" })]))?.id
    ).toBe("t");
    expect(
      Option.getOrNull(selectSubscription([sub("past_due", { id: "p" })]))?.id
    ).toBe("p");
  });
});

describe("decidePortalFlow", () => {
  it("cancels for a downgrade to free, regardless of items", () => {
    expect(
      decidePortalFlow(
        sub("active", { id: "sub_9", noItems: true }),
        "free",
        prices
      )
    ).toEqual({ kind: "cancel", subscriptionId: "sub_9" });
  });

  it("returns undefined when the subscription has no item", () => {
    expect(
      decidePortalFlow(sub("active", { noItems: true }), "pro", prices)
    ).toBeUndefined();
  });

  it("returns undefined when the target tier has no configured price", () => {
    const noPro = { ...prices, priceForTier: () => null };
    expect(decidePortalFlow(sub("active"), "pro", noPro)).toBeUndefined();
  });

  it("returns undefined when already on the target price", () => {
    expect(
      decidePortalFlow(sub("active", { priceId: "price_pro" }), "pro", prices)
    ).toBeUndefined();
  });

  it("builds a one-click update flow for an upgrade", () => {
    expect(
      decidePortalFlow(
        sub("active", { id: "sub_1", itemId: "si_1", priceId: "price_plus" }),
        "pro",
        prices
      )
    ).toEqual({
      kind: "update",
      subscriptionId: "sub_1",
      itemId: "si_1",
      priceId: "price_pro",
    });
  });

  it("builds a picker flow for a downgrade", () => {
    expect(
      decidePortalFlow(
        sub("active", { id: "sub_2", priceId: "price_pro" }),
        "plus",
        prices
      )
    ).toEqual({ kind: "pick", subscriptionId: "sub_2" });
  });

  it("preserves a yearly interval when upgrading (targets the yearly price)", () => {
    expect(
      decidePortalFlow(
        sub("active", {
          id: "sub_y",
          itemId: "si_y",
          priceId: "price_plus_yearly",
          interval: "year",
        }),
        "pro",
        prices
      )
    ).toEqual({
      kind: "update",
      subscriptionId: "sub_y",
      itemId: "si_y",
      priceId: "price_pro_yearly",
    });
  });

  it("preserves a yearly interval when downgrading (picks at period end)", () => {
    expect(
      decidePortalFlow(
        sub("active", {
          id: "sub_yd",
          priceId: "price_pro_yearly",
          interval: "year",
        }),
        "plus",
        prices
      )
    ).toEqual({ kind: "pick", subscriptionId: "sub_yd" });
  });

  it("returns undefined when already on the target yearly price", () => {
    expect(
      decidePortalFlow(
        sub("active", { priceId: "price_pro_yearly", interval: "year" }),
        "pro",
        prices
      )
    ).toBeUndefined();
  });

  it("treats an unrecognized current price as a non-downgrade (update)", () => {
    const result = decidePortalFlow(
      sub("active", { id: "sub_3", itemId: "si_3", priceId: "price_legacy" }),
      "pro",
      prices
    );
    expect(result).toEqual({
      kind: "update",
      subscriptionId: "sub_3",
      itemId: "si_3",
      priceId: "price_pro",
    });
  });
});

describe("portalFlowData", () => {
  const returnUrl = "https://app.test/welcome";

  it("returns undefined when there is no flow", () => {
    expect(portalFlowData(undefined, returnUrl)).toBeUndefined();
  });

  it("shapes an update flow as subscription_update_confirm", () => {
    const data = portalFlowData(
      {
        kind: "update",
        subscriptionId: "sub_1" as never,
        itemId: "si_1" as never,
        priceId: "price_pro" as never,
      },
      returnUrl
    );
    expect(data?.type).toBe("subscription_update_confirm");
    expect(data?.subscription_update_confirm).toEqual({
      subscription: "sub_1",
      items: [{ id: "si_1", price: "price_pro", quantity: 1 }],
    });
    expect(data?.after_completion?.redirect?.return_url).toBe(returnUrl);
  });

  it("shapes a pick flow as subscription_update", () => {
    const data = portalFlowData(
      { kind: "pick", subscriptionId: "sub_1" as never },
      returnUrl
    );
    expect(data?.type).toBe("subscription_update");
    expect(data?.subscription_update).toEqual({ subscription: "sub_1" });
  });

  it("shapes a cancel flow as subscription_cancel", () => {
    const data = portalFlowData(
      { kind: "cancel", subscriptionId: "sub_1" as never },
      returnUrl
    );
    expect(data?.type).toBe("subscription_cancel");
    expect(data?.subscription_cancel).toEqual({ subscription: "sub_1" });
  });
});

describe("StripeClientLive price maps", () => {
  const env = {
    STRIPE_API_KEY: "rk_test_x",
    STRIPE_WEBHOOK_SECRET: "whsec_x",
    STRIPE_PRICE_PLUS: "price_plus",
    STRIPE_PRICE_PRO: "price_pro",
    STRIPE_PRICE_PLUS_YEARLY: "price_plus_yearly",
    STRIPE_PRICE_PRO_YEARLY: "price_pro_yearly",
  } as unknown as Env;

  it.effect(
    "maps tier x interval <-> price both ways and rejects unknowns",
    () =>
      Effect.gen(function* () {
        const stripe = yield* StripeClient;
        expect(stripe.priceForTier("plus", "month")).toBe("price_plus");
        expect(stripe.priceForTier("plus", "year")).toBe("price_plus_yearly");
        expect(stripe.priceForTier("pro", "month")).toBe("price_pro");
        expect(stripe.priceForTier("pro", "year")).toBe("price_pro_yearly");
        expect(stripe.priceForTier("free", "month")).toBeNull();
        expect(stripe.priceForTier("free", "year")).toBeNull();
        expect(stripe.tierForPrice(StripePriceId.make("price_plus"))).toBe(
          "plus"
        );
        expect(
          stripe.tierForPrice(StripePriceId.make("price_plus_yearly"))
        ).toBe("plus");
        expect(stripe.tierForPrice(StripePriceId.make("price_pro"))).toBe(
          "pro"
        );
        expect(
          stripe.tierForPrice(StripePriceId.make("price_pro_yearly"))
        ).toBe("pro");
        expect(
          stripe.tierForPrice(StripePriceId.make("price_unknown"))
        ).toBeNull();
      }).pipe(Effect.provide(StripeClientLive(env)))
  );
});
