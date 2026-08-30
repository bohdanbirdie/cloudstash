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
  billingInterval: "month",
  cancelAtPeriodEnd: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  currentPeriodEnd: new Date("2026-09-01T00:00:00Z"),
  currentPeriodStart: new Date("2026-08-01T00:00:00Z"),
  featureOverrides: null,
  tier: "pro",
  tierSource: "stripe",
  usageCycleAnchor: new Date("2026-01-01T00:00:00Z"),
};

const countingDb = (rec: { reads: number }) =>
  Layer.succeed(DbClient, {
    query: {
      organization: {
        findFirst: () => {
          rec.reads += 1;
          return Promise.resolve(ORG_ROW);
        },
      },
    },
  } as never);

const withBilling = <A, E>(
  rec: { reads: number },
  effect: Effect.Effect<A, E, Billing>
) =>
  effect.pipe(Effect.provide(Layer.provide(Billing.Default, countingDb(rec))));

describe("Billing.orgBillingSnapshot", () => {
  it.effect("reads the organization row once", () => {
    const rec = { reads: 0 };

    return withBilling(
      rec,
      Effect.gen(function* () {
        const billing = yield* Billing;
        yield* billing.orgBillingSnapshot(ORG_ID);
        expect(rec.reads).toBe(1);
      })
    );
  });

  it.effect("returns the same values as the individual methods", () => {
    const rec = { reads: 0 };

    return withBilling(
      rec,
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
      })
    );
  });

  it.effect("carries the subscription fields the account menu renders", () => {
    const rec = { reads: 0 };

    return withBilling(
      rec,
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
      })
    );
  });
});
