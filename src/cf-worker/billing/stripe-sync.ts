import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import type { BillingInterval, PlanTier } from "@/lib/plan";

import {
  StripeCustomerId,
  StripePriceId,
  StripeSubscriptionId,
} from "../db/branded";
import type { OrgId } from "../db/branded";
import * as schema from "../db/schema";
import { DbClient, query } from "../db/service";
import { maskId } from "../log-utils";
import { OrgNotFoundError } from "../org/errors";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  selectSubscription,
  StripeClient,
} from "./stripe-client";

export const getOrCreateStripeCustomer = Effect.fn(
  "Billing.getOrCreateStripeCustomer"
)(function* (orgId: OrgId) {
  const db = yield* DbClient;
  const stripe = yield* StripeClient;

  const org = yield* query(
    db.query.organization.findFirst({
      where: eq(schema.organization.id, orgId),
      columns: { id: true, name: true, stripeCustomerId: true },
      with: {
        members: {
          where: eq(schema.member.role, "owner"),
          with: { user: { columns: { email: true } } },
          limit: 1,
        },
      },
    })
  ).pipe(
    Effect.flatMap((row) =>
      row ? Effect.succeed(row) : OrgNotFoundError.make({ orgId })
    )
  );

  if (org.stripeCustomerId) {
    yield* Effect.annotateCurrentSpan({ orgId: maskId(orgId), created: false });
    return org.stripeCustomerId;
  }

  const customer = yield* stripe.createCustomer({
    email: org.members[0]?.user?.email,
    name: org.name,
    metadata: { orgId },
    idempotencyKey: `customer:${orgId}`,
  });

  yield* query(
    db
      .update(schema.organization)
      .set({ stripeCustomerId: StripeCustomerId.make(customer.id) })
      .where(eq(schema.organization.id, orgId))
  );

  yield* Effect.annotateCurrentSpan({ orgId: maskId(orgId), created: true });
  yield* Effect.logInfo("Stripe customer created").pipe(
    Effect.annotateLogs({
      orgId: maskId(orgId),
      customerId: maskId(customer.id),
    })
  );
  return StripeCustomerId.make(customer.id);
});

export const getStripeCustomerId = Effect.fn("Billing.getStripeCustomerId")(
  function* (orgId: OrgId) {
    const db = yield* DbClient;
    const org = yield* query(
      db.query.organization.findFirst({
        where: eq(schema.organization.id, orgId),
        columns: { stripeCustomerId: true },
      })
    );
    return Option.fromNullable(org?.stripeCustomerId);
  }
);

export const syncFromStripe = Effect.fn("Billing.syncFromStripe")(function* (
  customerId: StripeCustomerId
) {
  const db = yield* DbClient;
  const stripe = yield* StripeClient;

  const org = yield* query(
    db.query.organization.findFirst({
      where: eq(schema.organization.stripeCustomerId, customerId),
      columns: { id: true, tier: true, tierSource: true },
    })
  );

  if (!org) {
    yield* Effect.logWarning("syncFromStripe: no org for customer").pipe(
      Effect.annotateLogs({ customerId: maskId(customerId) })
    );
    return;
  }

  yield* Effect.annotateCurrentSpan({
    orgId: maskId(org.id),
    tierSource: org.tierSource,
  });

  if (org.tierSource === "admin") {
    yield* Effect.logInfo("syncFromStripe: preserving admin grant").pipe(
      Effect.annotateLogs({ orgId: maskId(org.id) })
    );
    return;
  }

  const subscriptions = yield* stripe.listSubscriptions(customerId);
  const subscription = selectSubscription(subscriptions);
  const item = subscription.pipe(
    Option.flatMapNullable((s) => s.items.data[0])
  );
  const keepsTier = subscription.pipe(
    Option.exists((s) => ACTIVE_SUBSCRIPTION_STATUSES.has(s.status))
  );

  const tier: PlanTier = !keepsTier
    ? "free"
    : yield* Option.match(
        item.pipe(
          Option.flatMapNullable((i) =>
            stripe.tierForPrice(StripePriceId.make(i.price.id))
          )
        ),
        {
          onSome: (mapped) => Effect.succeed(mapped),
          onNone: () =>
            Effect.logWarning(
              "syncFromStripe: unrecognized price, leaving tier"
            ).pipe(
              Effect.annotateLogs({
                orgId: maskId(org.id),
                // Price IDs are non-PII config; log raw (not masked).
                priceId: item.pipe(
                  Option.map((i) => i.price.id),
                  Option.getOrUndefined
                ),
              }),
              Effect.as(org.tier)
            ),
        }
      );

  const billingInterval: BillingInterval | null = keepsTier
    ? item.pipe(
        Option.map((i) =>
          i.price.recurring?.interval === "year" ? "year" : "month"
        ),
        Option.getOrNull
      )
    : null;

  yield* Effect.annotateCurrentSpan({
    tier,
    billingInterval: billingInterval ?? "none",
  });

  yield* query(
    db
      .update(schema.organization)
      .set({
        tier,
        tierSource: "stripe",
        stripeSubscriptionId: subscription.pipe(
          Option.map((s) => StripeSubscriptionId.make(s.id)),
          Option.getOrNull
        ),
        subscriptionStatus: subscription.pipe(
          Option.map((s) => s.status),
          Option.getOrNull
        ),
        // Stripe period end is unix seconds; the column stores a ms timestamp.
        currentPeriodEnd: item.pipe(
          Option.map((i) => new Date(i.current_period_end * 1000)),
          Option.getOrNull
        ),
        cancelAtPeriodEnd: subscription.pipe(
          Option.map((s) => s.cancel_at != null),
          Option.getOrElse(() => false)
        ),
        billingInterval,
      })
      .where(eq(schema.organization.id, org.id))
  );

  yield* Effect.logInfo("syncFromStripe applied").pipe(
    Effect.annotateLogs({
      orgId: maskId(org.id),
      tier,
      status: subscription.pipe(
        Option.map((s) => s.status),
        Option.getOrElse(() => "none")
      ),
      cancelAtPeriodEnd: subscription.pipe(
        Option.map((s) => s.cancel_at != null),
        Option.getOrElse(() => false)
      ),
      billingInterval: billingInterval ?? "none",
    })
  );
});
