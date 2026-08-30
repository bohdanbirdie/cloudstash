import { describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { expect } from "vitest";

import { capabilitiesFor } from "@/lib/plan";

import { OrgId } from "../../db/branded";
import { DbClient } from "../../db/service";
import { Billing } from "../service";

// Regression: WK-03-A.
//
// billing/service.ts read the organization row three times to answer one
// question: fetchOrgRow ran for capabilities and again for tier, and
// subscription issued a third query against the same row for a different
// column set. org/service.ts called all three in sequence on /api/auth/me, so
// every page load paid three D1 round trips for one row — two of them
// byte-for-byte identical.
//
// orgBillingSnapshot answers all three from one read, and org/service.ts uses
// it. The individual methods stay for single-field callers.

const ORG_ID = OrgId.make("11111111-1111-4111-8111-111111111111");

const ORG_ROW = {
  adminTierGrant: null,
  adminTierGrantedAt: null,
  billingInterval: "month",
  cancelAtPeriodEnd: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  currentPeriodEnd: new Date("2026-09-01T00:00:00Z"),
  currentPeriodStart: new Date("2026-08-01T00:00:00Z"),
  featureOverrides: null,
  tier: "pro",
  usageCycleAnchor: new Date("2026-01-01T00:00:00Z"),
};

const countingDb = (rec: { reads: number }, row: object = ORG_ROW) =>
  Layer.succeed(DbClient, {
    query: {
      organization: {
        findFirst: () => {
          rec.reads += 1;
          return Promise.resolve(row);
        },
      },
    },
  } as never);

const withBilling = <A, E>(
  effect: Effect.Effect<A, E, Billing>,
  rec: { reads: number },
  row?: object
) =>
  effect.pipe(
    Effect.provide(Layer.provide(Billing.layer, countingDb(rec, row)))
  );

describe("Billing.orgBillingSnapshot", () => {
  it.effect("reads the organization row once", () => {
    const rec = { reads: 0 };

    return withBilling(
      Effect.gen(function* () {
        const billing = yield* Billing;
        yield* billing.orgBillingSnapshot(ORG_ID);
        expect(rec.reads).toBe(1);
      }),
      rec
    );
  });

  it.effect("returns the same values as the individual methods", () => {
    const rec = { reads: 0 };

    return withBilling(
      Effect.gen(function* () {
        const billing = yield* Billing;
        const snapshot = yield* billing.orgBillingSnapshot(ORG_ID);

        expect(snapshot.tier).toBe(yield* billing.tier(ORG_ID));
        expect(snapshot.capabilities).toEqual(
          yield* billing.capabilities(ORG_ID)
        );
        expect(snapshot.subscription).toEqual(
          yield* billing.subscription(ORG_ID)
        );
      }),
      rec
    );
  });

  it.effect("carries the subscription fields the account menu renders", () => {
    const rec = { reads: 0 };

    return withBilling(
      Effect.gen(function* () {
        const billing = yield* Billing;
        const { capabilities, subscription, tier } =
          yield* billing.orgBillingSnapshot(ORG_ID);

        expect(tier).toBe("pro");
        expect(capabilities).toEqual(capabilitiesFor("pro"));
        expect(subscription).toEqual({
          billingInterval: "month",
          cancelAtPeriodEnd: true,
          currentPeriodEnd: "2026-09-01T00:00:00.000Z",
        });
      }),
      rec
    );
  });

  // The snapshot feeds /api/auth/me, so reporting the raw Stripe tier here
  // would hide an admin grant from the whole app.
  it.effect("reports the admin grant, not the raw Stripe tier", () => {
    const rec = { reads: 0 };
    const granted = {
      ...ORG_ROW,
      adminTierGrant: "pro",
      adminTierGrantedAt: new Date("2026-02-01T00:00:00Z"),
      tier: "free",
    };

    return withBilling(
      Effect.gen(function* () {
        const billing = yield* Billing;
        const { capabilities, tier } =
          yield* billing.orgBillingSnapshot(ORG_ID);

        expect(tier).toBe("pro");
        expect(capabilities).toEqual(capabilitiesFor("pro"));
      }),
      rec,
      granted
    );
  });
});
