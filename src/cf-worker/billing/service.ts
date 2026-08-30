import { eq } from "drizzle-orm";
import {
  Context,
  DateTime,
  Effect,
  Layer,
  Match,
  Option,
  Schema,
} from "effect";

import type {
  BooleanCapability,
  CapabilityOverrides,
  PlanTier,
  TierCapabilities,
} from "@/lib/plan";
import {
  mergeCapabilities,
  PLAN_ORDER,
  requiredTierForBooleanCap,
  TIER_CAPABILITIES,
} from "@/lib/plan";

import type { OrgId } from "../db/branded";
import { OrgId as OrgIdBrand } from "../db/branded";
import * as schema from "../db/schema";
import { DbClient, DbError, query } from "../db/service";
import { maskId } from "../log-utils";
import { OrgNotFoundError } from "../org/errors";
import { CapabilityDisabledError } from "./errors";
import {
  AssistantUsageWindow,
  resolveAssistantUsageWindow,
} from "./usage-cycle";

type OrgRow = {
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  tier: PlanTier;
  adminTierGrant: PlanTier | null;
  adminTierGrantedAt: Date | null;
  featureOverrides: CapabilityOverrides | null;
  billingInterval: "month" | "year" | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  usageCycleAnchor: Date | null;
};

const PlanTierSchema = Schema.Literals(PLAN_ORDER);
const TierSourceSchema = Schema.Literals(["stripe", "admin"]);

const EffectivePlan = Schema.Struct({
  tier: PlanTierSchema,
  source: TierSourceSchema,
  usageCycleAnchor: Schema.NullOr(Schema.DateValid),
});
type EffectivePlan = Schema.Schema.Type<typeof EffectivePlan>;

const tierRank = (tier: PlanTier): number => PLAN_ORDER.indexOf(tier);

const resolveEffectivePlan = (row: OrgRow): EffectivePlan =>
  Option.fromNullishOr(row.adminTierGrant).pipe(
    Option.filter((grant) => tierRank(grant) > tierRank(row.tier)),
    Option.match({
      onNone: () =>
        EffectivePlan.make({
          tier: row.tier,
          source: "stripe",
          usageCycleAnchor: row.usageCycleAnchor,
        }),
      onSome: (grant) =>
        EffectivePlan.make({
          tier: grant,
          source: "admin",
          usageCycleAnchor: row.adminTierGrantedAt ?? row.createdAt,
        }),
    })
  );

const TierCapabilitiesSchema = Schema.Struct({
  aiSummary: Schema.Boolean,
  chatAgent: Schema.Boolean,
  integrations: Schema.Boolean,
  xBookmarkSync: Schema.Boolean,
  xContentEnrichment: Schema.Boolean,
  publicApi: Schema.Boolean,
  mcpServer: Schema.Boolean,
  weeklyDigest: Schema.Boolean,
  monthlyAssistantCredits: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

const CapabilityOverridesSchema = Schema.Struct({
  aiSummary: Schema.optionalKey(Schema.Boolean),
  chatAgent: Schema.optionalKey(Schema.Boolean),
  integrations: Schema.optionalKey(Schema.Boolean),
  xBookmarkSync: Schema.optionalKey(Schema.Boolean),
  xContentEnrichment: Schema.optionalKey(Schema.Boolean),
  publicApi: Schema.optionalKey(Schema.Boolean),
  mcpServer: Schema.optionalKey(Schema.Boolean),
  weeklyDigest: Schema.optionalKey(Schema.Boolean),
  monthlyAssistantCredits: Schema.optionalKey(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
  ),
});

export const WorkspaceWithOwner = Schema.Struct({
  id: OrgIdBrand,
  name: Schema.String,
  slug: Schema.NullOr(Schema.String),
  creatorEmail: Schema.NullOr(Schema.String),
  tier: PlanTierSchema,
  tierSource: TierSourceSchema,
  adminTierGrant: Schema.NullOr(PlanTierSchema),
  overrides: CapabilityOverridesSchema,
  capabilities: TierCapabilitiesSchema,
});
export type WorkspaceWithOwner = typeof WorkspaceWithOwner.Type;

export const AssistantAllowance = Schema.Struct({
  capabilities: TierCapabilitiesSchema,
  source: TierSourceSchema,
  usageWindow: Schema.Option(AssistantUsageWindow),
});
export type AssistantAllowance = Schema.Schema.Type<typeof AssistantAllowance>;

interface Subscription {
  readonly cancelAtPeriodEnd: boolean;
  readonly currentPeriodEnd: string | null;
  readonly billingInterval: "month" | "year" | null;
}

interface BillingShape {
  readonly capabilities: (
    orgId: OrgId
  ) => Effect.Effect<TierCapabilities, DbError | OrgNotFoundError>;
  readonly assistantAllowance: (
    orgId: OrgId,
    now?: Date
  ) => Effect.Effect<AssistantAllowance, DbError | OrgNotFoundError>;
  readonly tier: (
    orgId: OrgId
  ) => Effect.Effect<PlanTier, DbError | OrgNotFoundError>;
  readonly subscription: (
    orgId: OrgId
  ) => Effect.Effect<Subscription, DbError | OrgNotFoundError>;
  readonly orgBillingSnapshot: (orgId: OrgId) => Effect.Effect<
    {
      readonly tier: PlanTier;
      readonly capabilities: TierCapabilities;
      readonly subscription: Subscription;
    },
    DbError | OrgNotFoundError
  >;
  readonly getOverrides: (
    orgId: OrgId
  ) => Effect.Effect<CapabilityOverrides, DbError | OrgNotFoundError>;
  readonly setTier: (
    orgId: OrgId,
    tier: PlanTier
  ) => Effect.Effect<void, DbError | OrgNotFoundError>;
  readonly setOverride: <K extends keyof TierCapabilities>(
    orgId: OrgId,
    key: K,
    value: TierCapabilities[K] | null
  ) => Effect.Effect<void, DbError | OrgNotFoundError>;
  readonly exists: (orgId: OrgId) => Effect.Effect<boolean, DbError>;
  readonly listWithOwners: () => Effect.Effect<
    readonly WorkspaceWithOwner[],
    DbError
  >;
}

const make = Effect.gen(function* () {
  const db = yield* DbClient;

  const fetchOrgRow = (
    orgId: OrgId
  ): Effect.Effect<OrgRow, DbError | OrgNotFoundError> =>
    query(
      db.query.organization.findFirst({
        where: eq(schema.organization.id, orgId),
        columns: {
          cancelAtPeriodEnd: true,
          createdAt: true,
          tier: true,
          adminTierGrant: true,
          adminTierGrantedAt: true,
          featureOverrides: true,
          billingInterval: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          usageCycleAnchor: true,
        },
      })
    ).pipe(
      Effect.flatMap((row) =>
        row ? Effect.succeed(row) : OrgNotFoundError.make({ orgId })
      )
    );

  const toSubscription = (row: OrgRow): Subscription => ({
    billingInterval: row.billingInterval ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
  });

  return {
    /** Tier + admin overrides, merged into the runtime capability surface. */
    capabilities: Effect.fn("Billing.capabilities")(function* (orgId: OrgId) {
      const row = yield* fetchOrgRow(orgId);
      const plan = resolveEffectivePlan(row);
      yield* Effect.annotateCurrentSpan({
        orgId: maskId(orgId),
        tier: plan.tier,
        source: plan.source,
      });
      yield* Effect.logDebug("Billing.capabilities resolved").pipe(
        Effect.annotateLogs({
          orgId: maskId(orgId),
          tier: plan.tier,
          source: plan.source,
          overrideKeys: Object.keys(row.featureOverrides ?? {}),
        })
      );
      return mergeCapabilities(plan.tier, row.featureOverrides);
    }),

    assistantAllowance: Effect.fn("Billing.assistantAllowance")(function* (
      orgId: OrgId,
      now?: Date
    ) {
      const effectiveNow = now ?? (yield* DateTime.nowAsDate);
      const row = yield* fetchOrgRow(orgId);
      const plan = resolveEffectivePlan(row);
      const capabilities = mergeCapabilities(plan.tier, row.featureOverrides);
      const usageWindow = Option.fromNullishOr(
        resolveAssistantUsageWindow(
          {
            source: plan.source,
            billingInterval: row.billingInterval,
            currentPeriodStart: row.currentPeriodStart,
            currentPeriodEnd: row.currentPeriodEnd,
            usageCycleAnchor: plan.usageCycleAnchor,
          },
          effectiveNow
        )
      );
      yield* Effect.annotateCurrentSpan({
        orgId: maskId(orgId),
        source: plan.source,
        hasUsageWindow: Option.isSome(usageWindow),
      });
      return AssistantAllowance.make({
        capabilities,
        source: plan.source,
        usageWindow,
      });
    }),

    tier: Effect.fn("Billing.tier")(function* (orgId: OrgId) {
      const row = yield* fetchOrgRow(orgId);
      const plan = resolveEffectivePlan(row);
      yield* Effect.annotateCurrentSpan({
        orgId: maskId(orgId),
        tier: plan.tier,
        source: plan.source,
      });
      yield* Effect.logDebug("Billing.tier resolved").pipe(
        Effect.annotateLogs({
          orgId: maskId(orgId),
          tier: plan.tier,
          source: plan.source,
        })
      );
      return plan.tier;
    }),

    subscription: Effect.fn("Billing.subscription")(function* (orgId: OrgId) {
      const row = yield* fetchOrgRow(orgId);
      yield* Effect.annotateCurrentSpan({
        orgId: maskId(orgId),
        interval: row.billingInterval ?? "none",
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      });
      return toSubscription(row);
    }),

    orgBillingSnapshot: Effect.fn("Billing.orgBillingSnapshot")(function* (
      orgId: OrgId
    ) {
      const row = yield* fetchOrgRow(orgId);
      yield* Effect.annotateCurrentSpan({
        orgId: maskId(orgId),
        tier: row.tier,
      });
      return {
        capabilities: mergeCapabilities(row.tier, row.featureOverrides),
        subscription: toSubscription(row),
        tier: row.tier,
      };
    }),

    getOverrides: Effect.fn("Billing.getOverrides")(function* (orgId: OrgId) {
      const row = yield* fetchOrgRow(orgId);
      yield* Effect.annotateCurrentSpan({ orgId: maskId(orgId) });
      return row.featureOverrides ?? {};
    }),

    /** Admin tier floor. Free clears the grant; Stripe state remains untouched. */
    setTier: Effect.fn("Billing.setTier")(function* (
      orgId: OrgId,
      tier: PlanTier
    ) {
      const existing = yield* fetchOrgRow(orgId);
      const previousPlan = resolveEffectivePlan(existing);
      const grant = Match.value({
        isFree: tier === "free",
        isUnchanged: existing.adminTierGrant === tier,
      }).pipe(
        Match.when({ isFree: true }, () =>
          Effect.succeed({ tier: null, grantedAt: null })
        ),
        Match.when({ isUnchanged: true }, () =>
          Effect.succeed({
            tier,
            grantedAt: existing.adminTierGrantedAt ?? existing.createdAt,
          })
        ),
        Match.orElse(() =>
          DateTime.nowAsDate.pipe(
            Effect.map((grantedAt) => ({ tier, grantedAt }))
          )
        )
      );
      const resolvedGrant = yield* grant;
      const nextPlan = resolveEffectivePlan({
        ...existing,
        adminTierGrant: resolvedGrant.tier,
        adminTierGrantedAt: resolvedGrant.grantedAt,
      });
      const telemetry = {
        orgId: maskId(orgId),
        from: previousPlan.tier,
        to: nextPlan.tier,
        requestedGrant: tier,
        storedGrant: resolvedGrant.tier ?? "none",
        fromSource: previousPlan.source,
        toSource: nextPlan.source,
        grantCleared: resolvedGrant.tier === null,
      };
      yield* Effect.annotateCurrentSpan(telemetry);
      yield* query(
        db
          .update(schema.organization)
          .set({
            adminTierGrant: resolvedGrant.tier,
            adminTierGrantedAt: resolvedGrant.grantedAt,
          })
          .where(eq(schema.organization.id, orgId))
      );
      yield* Effect.logInfo("Billing.setTier applied").pipe(
        Effect.annotateLogs(telemetry)
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
      yield* Effect.annotateCurrentSpan({ orgId: maskId(orgId) });
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
      return orgs.map((org) => {
        const overrides = org.featureOverrides ?? {};
        const plan = resolveEffectivePlan({
          createdAt: org.createdAt,
          tier: org.tier ?? "free",
          adminTierGrant: org.adminTierGrant,
          adminTierGrantedAt: org.adminTierGrantedAt,
          featureOverrides: org.featureOverrides,
          billingInterval: org.billingInterval,
          currentPeriodStart: org.currentPeriodStart,
          currentPeriodEnd: org.currentPeriodEnd,
          usageCycleAnchor: org.usageCycleAnchor,
        });
        return WorkspaceWithOwner.make({
          id: OrgIdBrand.make(org.id),
          name: org.name,
          slug: org.slug,
          creatorEmail: org.members[0]?.user?.email ?? null,
          tier: plan.tier,
          tierSource: plan.source,
          adminTierGrant: org.adminTierGrant,
          overrides,
          capabilities: { ...TIER_CAPABILITIES[plan.tier], ...overrides },
        });
      });
    }),
  } satisfies BillingShape;
});

export class Billing extends Context.Service<Billing, BillingShape>()(
  "@cloudstash/Billing"
) {
  static readonly layer = Layer.effect(Billing, make);
}

/**
 * Gate helper: fail with `CapabilityDisabledError` if the org doesn't have
 * `capability` enabled at its current tier (after overrides). Use at the top
 * of any handler that should be paywalled.
 */
export const requireCapability = Effect.fnUntraced(function* (
  orgId: OrgId,
  capability: BooleanCapability
) {
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
});
