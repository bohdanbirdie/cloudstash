import { describe, expect, it } from "@effect/vitest";
import { Effect, Either, Layer, LogLevel, Logger, Option } from "effect";
import type StripeSdk from "stripe";

import type { BillingInterval, PlanTier } from "@/lib/plan";

import { OrgId, StripeCustomerId } from "../../db/branded";
import { DbClient } from "../../db/service";
import { OrgNotFoundError } from "../../org/errors";
import { StripeClient } from "../stripe-client";
import type { StripeClientShape } from "../stripe-client";
import {
  getOrCreateStripeCustomer,
  getStripeCustomerId,
  syncFromStripe,
} from "../stripe-sync";

const ORG_ID = OrgId.make("11111111-1111-4111-8111-111111111111");
const CUSTOMER_ID = StripeCustomerId.make("cus_123");

const quiet = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Logger.withMinimumLogLevel(LogLevel.None));

const notImpl = (): Effect.Effect<never> =>
  Effect.die("StripeClient method not stubbed in test");

const stripeStub = (overrides: Partial<StripeClientShape>) =>
  Layer.succeed(StripeClient, {
    createCustomer: notImpl,
    createCheckoutSession: notImpl,
    createPortalSession: notImpl,
    listSubscriptions: () => Effect.succeed([]),
    constructWebhookEvent: notImpl,
    tierForPrice: (id: string) =>
      id === "price_pro" ? "pro" : id === "price_plus" ? "plus" : null,
    priceForTier: () => null,
    ...overrides,
  } as unknown as StripeClientShape);

const sub = (
  status: string,
  opts: {
    id?: string;
    priceId?: string;
    cancelAtPeriodEnd?: boolean;
    periodEnd?: number;
    noItems?: boolean;
    interval?: BillingInterval;
  } = {}
): StripeSdk.Subscription =>
  ({
    id: opts.id ?? "sub_1",
    status,
    cancel_at: opts.cancelAtPeriodEnd
      ? (opts.periodEnd ?? 1_700_000_000)
      : null,
    items: {
      data: opts.noItems
        ? []
        : [
            {
              id: "si_1",
              price: {
                id: opts.priceId ?? "price_pro",
                recurring: { interval: opts.interval ?? "month" },
              },
              current_period_end: opts.periodEnd ?? 1_700_000_000,
            },
          ],
    },
  }) as unknown as StripeSdk.Subscription;

type OrgRow = { id: string; tier: PlanTier; tierSource: string };

interface SyncDbOptions {
  org?: OrgRow | undefined;
  updates: Record<string, unknown>[];
}

const syncDb = (opts: SyncDbOptions) =>
  Layer.succeed(DbClient, {
    query: {
      organization: {
        findFirst: () => Promise.resolve(opts.org),
      },
    },
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => {
          opts.updates.push(vals);
          return Promise.resolve(undefined);
        },
      }),
    }),
  } as never);

const ORG: OrgRow = { id: ORG_ID, tier: "free", tierSource: "stripe" };

describe("syncFromStripe", () => {
  it.effect("no-ops when no org maps to the customer", () => {
    const updates: Record<string, unknown>[] = [];
    return syncFromStripe(CUSTOMER_ID).pipe(
      Effect.provide(
        Layer.mergeAll(stripeStub({}), syncDb({ org: undefined, updates }))
      ),
      quiet,
      Effect.tap(() =>
        Effect.sync(() => {
          expect(updates).toEqual([]);
        })
      )
    );
  });

  it.effect("preserves an admin tier grant without touching Stripe", () => {
    const updates: Record<string, unknown>[] = [];
    let listed = false;
    return syncFromStripe(CUSTOMER_ID).pipe(
      Effect.provide(
        Layer.mergeAll(
          stripeStub({
            listSubscriptions: () => {
              listed = true;
              return Effect.succeed([]);
            },
          }),
          syncDb({
            org: { ...ORG, tierSource: "admin" },
            updates,
          })
        )
      ),
      quiet,
      Effect.tap(() =>
        Effect.sync(() => {
          expect(updates).toEqual([]);
          expect(listed).toBe(false);
        })
      )
    );
  });

  it.effect("maps an active subscription to its tier", () => {
    const updates: Record<string, unknown>[] = [];
    return syncFromStripe(CUSTOMER_ID).pipe(
      Effect.provide(
        Layer.mergeAll(
          stripeStub({
            listSubscriptions: () =>
              Effect.succeed([
                sub("active", { id: "sub_pro", priceId: "price_pro" }),
              ]),
          }),
          syncDb({ org: ORG, updates })
        )
      ),
      quiet,
      Effect.tap(() =>
        Effect.sync(() => {
          expect(updates).toHaveLength(1);
          const v = updates[0];
          expect(v.tier).toBe("pro");
          expect(v.tierSource).toBe("stripe");
          expect(v.stripeSubscriptionId).toBe("sub_pro");
          expect(v.subscriptionStatus).toBe("active");
          expect(v.cancelAtPeriodEnd).toBe(false);
          expect(v.currentPeriodEnd).toBeInstanceOf(Date);
          expect(v.billingInterval).toBe("month");
        })
      )
    );
  });

  it.effect("records the yearly billing interval", () => {
    const updates: Record<string, unknown>[] = [];
    return syncFromStripe(CUSTOMER_ID).pipe(
      Effect.provide(
        Layer.mergeAll(
          stripeStub({
            listSubscriptions: () =>
              Effect.succeed([
                sub("active", {
                  id: "sub_pro_y",
                  priceId: "price_pro",
                  interval: "year",
                }),
              ]),
          }),
          syncDb({ org: ORG, updates })
        )
      ),
      quiet,
      Effect.tap(() =>
        Effect.sync(() => {
          expect(updates[0]?.tier).toBe("pro");
          expect(updates[0]?.billingInterval).toBe("year");
        })
      )
    );
  });

  it.effect(
    "flags a scheduled cancellation (cancel_at set, still active)",
    () => {
      const updates: Record<string, unknown>[] = [];
      return syncFromStripe(CUSTOMER_ID).pipe(
        Effect.provide(
          Layer.mergeAll(
            stripeStub({
              listSubscriptions: () =>
                Effect.succeed([
                  sub("active", {
                    id: "sub_pro",
                    priceId: "price_pro",
                    cancelAtPeriodEnd: true,
                  }),
                ]),
            }),
            syncDb({ org: ORG, updates })
          )
        ),
        quiet,
        Effect.tap(() =>
          Effect.sync(() => {
            const v = updates[0];
            expect(v.tier).toBe("pro");
            expect(v.cancelAtPeriodEnd).toBe(true);
          })
        )
      );
    }
  );

  it.effect("prefers the active sub over a newer canceled one (S1)", () => {
    const updates: Record<string, unknown>[] = [];
    return syncFromStripe(CUSTOMER_ID).pipe(
      Effect.provide(
        Layer.mergeAll(
          stripeStub({
            listSubscriptions: () =>
              // Stripe lists newest-first: a newer canceled sub must not
              // downgrade a still-active paid one.
              Effect.succeed([
                sub("canceled", { id: "sub_new", priceId: "price_plus" }),
                sub("active", { id: "sub_active", priceId: "price_pro" }),
              ]),
          }),
          syncDb({ org: ORG, updates })
        )
      ),
      quiet,
      Effect.tap(() =>
        Effect.sync(() => {
          expect(updates[0]?.tier).toBe("pro");
          expect(updates[0]?.stripeSubscriptionId).toBe("sub_active");
        })
      )
    );
  });

  it.effect("downgrades to free when no subscription is active", () => {
    const updates: Record<string, unknown>[] = [];
    return syncFromStripe(CUSTOMER_ID).pipe(
      Effect.provide(
        Layer.mergeAll(
          stripeStub({
            listSubscriptions: () =>
              Effect.succeed([
                sub("canceled", { id: "sub_dead", priceId: "price_pro" }),
              ]),
          }),
          syncDb({ org: { ...ORG, tier: "pro" }, updates })
        )
      ),
      quiet,
      Effect.tap(() =>
        Effect.sync(() => {
          expect(updates[0]?.tier).toBe("free");
          expect(updates[0]?.subscriptionStatus).toBe("canceled");
          // No active plan → no interval.
          expect(updates[0]?.billingInterval).toBeNull();
        })
      )
    );
  });

  it.effect("leaves the tier unchanged for an unrecognized price", () => {
    const updates: Record<string, unknown>[] = [];
    return syncFromStripe(CUSTOMER_ID).pipe(
      Effect.provide(
        Layer.mergeAll(
          stripeStub({
            listSubscriptions: () =>
              Effect.succeed([
                sub("active", { id: "sub_x", priceId: "price_legacy" }),
              ]),
          }),
          syncDb({ org: { ...ORG, tier: "plus" }, updates })
        )
      ),
      quiet,
      Effect.tap(() =>
        Effect.sync(() => {
          // Unknown price → keep the org's current tier rather than guessing.
          expect(updates[0]?.tier).toBe("plus");
          // …but the active sub's interval is still recorded.
          expect(updates[0]?.billingInterval).toBe("month");
        })
      )
    );
  });
});

describe("getStripeCustomerId", () => {
  const db = (stripeCustomerId: string | undefined | null) =>
    Layer.succeed(DbClient, {
      query: {
        organization: {
          findFirst: () =>
            Promise.resolve(
              stripeCustomerId === undefined ? undefined : { stripeCustomerId }
            ),
        },
      },
    } as never);

  it.effect("returns some branded id when present", () =>
    getStripeCustomerId(ORG_ID).pipe(
      Effect.provide(db("cus_abc")),
      Effect.tap((id) =>
        Effect.sync(() => expect(Option.getOrNull(id)).toBe("cus_abc"))
      )
    )
  );

  it.effect("returns none when the column is empty", () =>
    getStripeCustomerId(ORG_ID).pipe(
      Effect.provide(db(null)),
      Effect.tap((id) =>
        Effect.sync(() => expect(Option.isNone(id)).toBe(true))
      )
    )
  );

  it.effect("returns none when the org row is missing", () =>
    getStripeCustomerId(ORG_ID).pipe(
      Effect.provide(db(undefined)),
      Effect.tap((id) =>
        Effect.sync(() => expect(Option.isNone(id)).toBe(true))
      )
    )
  );
});

describe("getOrCreateStripeCustomer", () => {
  interface CustomerDbOptions {
    org?:
      | {
          id: string;
          name: string;
          stripeCustomerId: string | null;
          members: { user: { email: string } | null }[];
        }
      | undefined;
    updates: Record<string, unknown>[];
  }

  const customerDb = (opts: CustomerDbOptions) =>
    Layer.succeed(DbClient, {
      query: {
        organization: {
          findFirst: () => Promise.resolve(opts.org),
        },
      },
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: () => {
            opts.updates.push(vals);
            return Promise.resolve(undefined);
          },
        }),
      }),
    } as never);

  it.effect("returns the existing customer id without creating", () => {
    const updates: Record<string, unknown>[] = [];
    let created = false;
    return getOrCreateStripeCustomer(ORG_ID).pipe(
      Effect.provide(
        Layer.mergeAll(
          stripeStub({
            createCustomer: () => {
              created = true;
              return Effect.succeed({ id: "cus_new" } as never);
            },
          }),
          customerDb({
            org: {
              id: ORG_ID,
              name: "Acme",
              stripeCustomerId: "cus_existing",
              members: [{ user: { email: "a@b.c" } }],
            },
            updates,
          })
        )
      ),
      quiet,
      Effect.tap((id) =>
        Effect.sync(() => {
          expect(id).toBe("cus_existing");
          expect(created).toBe(false);
          expect(updates).toEqual([]);
        })
      )
    );
  });

  it.effect("creates and persists a customer when none exists", () => {
    const updates: Record<string, unknown>[] = [];
    return getOrCreateStripeCustomer(ORG_ID).pipe(
      Effect.provide(
        Layer.mergeAll(
          stripeStub({
            createCustomer: () => Effect.succeed({ id: "cus_new" } as never),
          }),
          customerDb({
            org: {
              id: ORG_ID,
              name: "Acme",
              stripeCustomerId: null,
              members: [{ user: { email: "a@b.c" } }],
            },
            updates,
          })
        )
      ),
      quiet,
      Effect.tap((id) =>
        Effect.sync(() => {
          expect(id).toBe("cus_new");
          expect(updates[0]?.stripeCustomerId).toBe("cus_new");
        })
      )
    );
  });

  it.effect("fails with OrgNotFoundError when the org is missing", () => {
    const updates: Record<string, unknown>[] = [];
    return getOrCreateStripeCustomer(ORG_ID).pipe(
      Effect.provide(
        Layer.mergeAll(stripeStub({}), customerDb({ org: undefined, updates }))
      ),
      quiet,
      Effect.either,
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left).toBeInstanceOf(OrgNotFoundError);
          }
        })
      )
    );
  });
});
