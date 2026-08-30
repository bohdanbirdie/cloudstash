import { describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { expect } from "vitest";

import { OrgId } from "../../db/branded";
import { DbClient } from "../../db/service";
import { Billing } from "../service";

// Regression: WK-03-A.
//
// billing/service.ts reads the organization row three times to answer one
// question. fetchOrgRow runs for capabilities and again for tier, and
// subscription issues a third query against the same row for a different
// column set. org/service.ts calls all three in sequence, and that sequence
// sits on /api/auth/me — so every page load costs three D1 round trips for
// one row, two of them byte-for-byte identical.
//
// This pins the contract rather than the implementation: resolving an org's
// billing state must not re-read the row. Either a combined snapshot method
// that the three facets delegate to, or a request-scoped memo on fetchOrgRow,
// satisfies it.

const ORG_ID = OrgId.make("11111111-1111-4111-8111-111111111111");

const ORG_ROW = {
  billingInterval: "month",
  cancelAtPeriodEnd: false,
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

describe("Billing organization row reads", () => {
  it.effect(
    "reads the row once for tier, capabilities and subscription",
    () => {
      const rec = { reads: 0 };

      return Effect.gen(function* () {
        const billing = yield* Billing;

        // The exact sequence org/service.ts runs for GET /api/auth/me.
        yield* billing.tier(ORG_ID);
        yield* billing.capabilities(ORG_ID);
        yield* billing.subscription(ORG_ID);

        expect(rec.reads).toBe(1);
      }).pipe(Effect.provide(Layer.provide(Billing.Default, countingDb(rec))));
    }
  );
});
