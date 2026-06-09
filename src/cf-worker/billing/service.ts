import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type {
  BooleanCapability,
  CapabilityOverrides,
  PlanTier,
  TierCapabilities,
} from "@/lib/plan";
import {
  mergeCapabilities,
  requiredTierForBooleanCap,
  TIER_CAPABILITIES,
} from "@/lib/plan";

import type { OrgId } from "../db/branded";
import { OrgId as OrgIdBrand } from "../db/branded";
import * as schema from "../db/schema";
import type { TierSource } from "../db/schema";
import { DbClient, DbError, query } from "../db/service";
import { maskId } from "../log-utils";
import { OrgNotFoundError } from "../org/errors";
import { CapabilityDisabledError } from "./errors";

export interface WorkspaceWithOwner {
  id: OrgId;
  name: string;
  slug: string | null;
  creatorEmail: string | null;
  tier: PlanTier;
  tierSource: TierSource;
  overrides: CapabilityOverrides;
  capabilities: TierCapabilities;
}

type OrgRow = {
  tier: PlanTier;
  featureOverrides: CapabilityOverrides | null;
};

export class Billing extends Effect.Service<Billing>()("@cloudstash/Billing", {
  effect: Effect.gen(function* () {
    const db = yield* DbClient;

    const fetchOrgRow = (
      orgId: OrgId
    ): Effect.Effect<OrgRow, DbError | OrgNotFoundError> =>
      query(
        db.query.organization.findFirst({
          where: eq(schema.organization.id, orgId),
          columns: { tier: true, featureOverrides: true },
        })
      ).pipe(
        Effect.flatMap((row) =>
          row ? Effect.succeed(row) : OrgNotFoundError.make({ orgId })
        )
      );

    return {
      /** Tier + admin overrides, merged into the runtime capability surface. */
      capabilities: Effect.fn("Billing.capabilities")(function* (orgId: OrgId) {
        const row = yield* fetchOrgRow(orgId);
        yield* Effect.annotateCurrentSpan({
          orgId: maskId(orgId),
          tier: row.tier,
        });
        yield* Effect.logDebug("Billing.capabilities resolved").pipe(
          Effect.annotateLogs({
            orgId: maskId(orgId),
            tier: row.tier,
            overrideKeys: Object.keys(row.featureOverrides ?? {}),
          })
        );
        return mergeCapabilities(row.tier, row.featureOverrides);
      }),

      tier: Effect.fn("Billing.tier")(function* (orgId: OrgId) {
        const row = yield* fetchOrgRow(orgId);
        yield* Effect.annotateCurrentSpan({
          orgId: maskId(orgId),
          tier: row.tier,
        });
        yield* Effect.logDebug("Billing.tier resolved").pipe(
          Effect.annotateLogs({ orgId: maskId(orgId), tier: row.tier })
        );
        return row.tier;
      }),

      subscription: Effect.fn("Billing.subscription")(function* (orgId: OrgId) {
        const row = yield* query(
          db.query.organization.findFirst({
            where: eq(schema.organization.id, orgId),
            columns: {
              cancelAtPeriodEnd: true,
              currentPeriodEnd: true,
              billingInterval: true,
            },
          })
        ).pipe(
          Effect.flatMap((r) =>
            r ? Effect.succeed(r) : OrgNotFoundError.make({ orgId })
          )
        );
        yield* Effect.annotateCurrentSpan({
          orgId: maskId(orgId),
          interval: row.billingInterval ?? "none",
          cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        });
        return {
          cancelAtPeriodEnd: row.cancelAtPeriodEnd,
          currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
          billingInterval: row.billingInterval ?? null,
        };
      }),

      getOverrides: Effect.fn("Billing.getOverrides")(function* (orgId: OrgId) {
        const row = yield* fetchOrgRow(orgId);
        yield* Effect.annotateCurrentSpan({ orgId: maskId(orgId) });
        return row.featureOverrides ?? {};
      }),

      /** Admin grant. Stamps tierSource="admin"; syncFromStripe leaves it alone. */
      setTier: Effect.fn("Billing.setTier")(function* (
        orgId: OrgId,
        tier: PlanTier
      ) {
        // Always write even if tier is unchanged: an admin re-setting a
        // stripe-sourced tier needs `tierSource` flipped to "admin" so the
        // grant survives subsequent Stripe syncs. A no-op skip would silently
        // leave tierSource="stripe".
        const existing = yield* fetchOrgRow(orgId);
        yield* Effect.annotateCurrentSpan({
          orgId: maskId(orgId),
          from: existing.tier,
          to: tier,
        });
        yield* query(
          db
            .update(schema.organization)
            .set({ tier, tierSource: "admin" })
            .where(eq(schema.organization.id, orgId))
        );
        yield* Effect.logInfo("Billing.setTier applied").pipe(
          Effect.annotateLogs({
            orgId: maskId(orgId),
            from: existing.tier,
            to: tier,
            tierSource: "admin",
          })
        );
      }),

      /**
       * Set a single override. `value === null` removes the override so the
       * cap falls back to the tier default.
       */
      setOverride: Effect.fn("Billing.setOverride")(function* <
        K extends keyof TierCapabilities,
      >(orgId: OrgId, key: K, value: TierCapabilities[K] | null) {
        const existing = yield* fetchOrgRow(orgId);
        const current: CapabilityOverrides = existing.featureOverrides ?? {};
        const next: CapabilityOverrides = { ...current };
        const previous = current[key];
        if (value === null) {
          delete next[key];
        } else {
          next[key] = value;
        }
        yield* Effect.annotateCurrentSpan({
          orgId: maskId(orgId),
          key,
          cleared: value === null,
        });
        yield* query(
          db
            .update(schema.organization)
            .set({ featureOverrides: next })
            .where(eq(schema.organization.id, orgId))
        );
        yield* Effect.logInfo("Billing.setOverride applied").pipe(
          Effect.annotateLogs({
            orgId: maskId(orgId),
            key,
            previous,
            next: value,
            cleared: value === null,
          })
        );
      }),

      /** True if the org row exists. */
      exists: Effect.fn("Billing.exists")(function* (orgId: OrgId) {
        const row = yield* query(
          db.query.organization.findFirst({
            where: eq(schema.organization.id, orgId),
            columns: { id: true },
          })
        );
        return !!row;
      }),

      listWithOwners: Effect.fn("Billing.listWithOwners")(function* () {
        const orgs = yield* query(
          db.query.organization.findMany({
            with: {
              members: {
                where: eq(schema.member.role, "owner"),
                with: { user: { columns: { email: true } } },
                limit: 1,
              },
            },
          })
        );
        yield* Effect.annotateCurrentSpan({ count: orgs.length });
        return orgs.map((org): WorkspaceWithOwner => {
          const overrides = org.featureOverrides ?? {};
          const tier = org.tier ?? "free";
          return {
            id: OrgIdBrand.make(org.id),
            name: org.name,
            slug: org.slug,
            creatorEmail: org.members[0]?.user?.email ?? null,
            tier,
            tierSource: org.tierSource,
            overrides,
            capabilities: { ...TIER_CAPABILITIES[tier], ...overrides },
          };
        });
      }),
    };
  }),
}) {}

/**
 * Gate helper: fail with `CapabilityDisabledError` if the org doesn't have
 * `capability` enabled at its current tier (after overrides). Use at the top
 * of any handler that should be paywalled.
 */
export const requireCapability = Effect.fn("Billing.requireCapability")(
  function* (orgId: OrgId, capability: BooleanCapability) {
    const billing = yield* Billing;
    const caps = yield* billing.capabilities(orgId);
    yield* Effect.annotateCurrentSpan({
      orgId: maskId(orgId),
      capability,
      allowed: caps[capability],
    });
    if (!caps[capability]) {
      yield* Effect.logInfo("Billing.requireCapability denied").pipe(
        Effect.annotateLogs({ orgId: maskId(orgId), capability })
      );
      return yield* CapabilityDisabledError.for(
        orgId,
        capability,
        requiredTierForBooleanCap(capability)
      );
    }
  }
);
