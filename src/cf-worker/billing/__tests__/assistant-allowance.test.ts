import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option, References } from "effect";
import type StripeSdk from "stripe";

import { capabilitiesFor } from "@/lib/plan";

import { OrgId, StripeCustomerId } from "../../db/branded";
import { DbClient } from "../../db/service";
import { resolveAssistantAllowance } from "../assistant-allowance";
import { AssistantAllowance, Billing } from "../service";
import { StripeClient } from "../stripe-client";
import type { StripeClientShape } from "../stripe-client";

const ORG_ID = OrgId.make("11111111-1111-4111-8111-111111111111");
const CUSTOMER_ID = StripeCustomerId.make("cus_existing");
const WINDOW = {
  id: "2026-08-17T14:30:00.000Z",
  startsAt: "2026-08-17T14:30:00.000Z",
  resetsAt: "2026-09-17T14:30:00.000Z",
} as const;

const notUsed = <A>(): Effect.Effect<A> => Effect.die("Unexpected Stripe call");

describe("resolveAssistantAllowance", () => {
  it.effect("refreshes a missing legacy Stripe cycle once", () => {
    let allowanceReads = 0;
    let organizationReads = 0;
    let subscriptionReads = 0;
    const updates: Record<string, unknown>[] = [];

    const billing = Layer.succeed(Billing, {
      assistantAllowance: () => {
        allowanceReads += 1;
        return Effect.succeed(
          AssistantAllowance.make({
            capabilities: capabilitiesFor("pro"),
            source: "stripe",
            usageWindow:
              allowanceReads === 1 ? Option.none() : Option.some(WINDOW),
          })
        );
      },
    } as unknown as Billing["Service"]);
    const db = Layer.succeed(DbClient, {
      query: {
        organization: {
          findFirst: () => {
            organizationReads += 1;
            return Promise.resolve(
              organizationReads === 1
                ? { stripeCustomerId: CUSTOMER_ID }
                : { id: ORG_ID, tier: "pro", tierSource: "stripe" }
            );
          },
        },
      },
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: () => {
            updates.push(values);
            return Promise.resolve();
          },
        }),
      }),
    } as never);
    const stripe = Layer.succeed(StripeClient, {
      createCustomer: notUsed,
      createCheckoutSession: notUsed,
      createPortalSession: notUsed,
      cancelSubscription: notUsed,
      constructWebhookEvent: notUsed,
      priceForTier: () => null,
      tierForPrice: () => "pro",
      listSubscriptions: () => {
        subscriptionReads += 1;
        return Effect.succeed([
          {
            id: "sub_existing",
            status: "active",
            billing_cycle_anchor: 1_768_663_800,
            cancel_at: null,
            items: {
              data: [
                {
                  id: "si_existing",
                  price: {
                    id: "price_pro",
                    recurring: { interval: "year" },
                  },
                  current_period_start: 1_768_663_800,
                  current_period_end: 1_800_199_800,
                },
              ],
            },
          } as unknown as StripeSdk.Subscription,
        ]);
      },
    } satisfies StripeClientShape);

    return Effect.gen(function* () {
      const first = yield* resolveAssistantAllowance(ORG_ID);
      const second = yield* resolveAssistantAllowance(ORG_ID);
      expect(Option.getOrNull(first.usageWindow)).toEqual(WINDOW);
      expect(Option.getOrNull(second.usageWindow)).toEqual(WINDOW);
      expect(subscriptionReads).toBe(1);
      expect(updates).toHaveLength(1);
      expect(updates[0]?.usageCycleAnchor).toBeInstanceOf(Date);
    }).pipe(
      Effect.provide(Layer.mergeAll(billing, db, stripe)),
      Effect.provideService(References.MinimumLogLevel, "None")
    );
  });
});
