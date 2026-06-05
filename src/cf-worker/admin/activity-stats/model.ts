import { PLAN_ORDER } from "@/lib/plan";
import type { PlanTier } from "@/lib/plan";

import { GROWTH_WEEKS, PAYING_STATUSES, TIER_PRICE_USD } from "./constants";
import { inGrowthWindow, toMs } from "./helpers";
import type { Org, OrgFactRow } from "./types";

export const enrichOrg = (row: OrgFactRow): Org => {
  const tier: PlanTier = PLAN_ORDER.includes(row.tier) ? row.tier : "free";
  const isPaying =
    tier !== "free" &&
    row.subscriptionStatus !== null &&
    PAYING_STATUSES.has(row.subscriptionStatus);
  return {
    id: row.id,
    tier,
    createdAtMs: toMs(row.createdAt),
    saves: row.saves,
    saves7d: row.saves7d,
    isActive7d: row.saves7d >= 1,
    isPaying,
    priceUsd: isPaying ? TIER_PRICE_USD[tier] : 0,
  };
};

export const buildWeeklyActivity = (
  rows: { organizationId: string; week: number; saves: number }[]
) => {
  const activeOrgsByWeek = new Map<number, Set<string>>();
  const savesByWeek = Array.from({ length: GROWTH_WEEKS }, () => 0);
  for (const row of rows) {
    const week = Math.floor(Number(row.week));
    if (!inGrowthWindow(week)) continue;
    const orgsThisWeek = activeOrgsByWeek.get(week) ?? new Set<string>();
    orgsThisWeek.add(row.organizationId);
    activeOrgsByWeek.set(week, orgsThisWeek);
    savesByWeek[week] += Number(row.saves);
  }
  return { activeOrgsByWeek, savesByWeek };
};

export type WeeklyActivity = ReturnType<typeof buildWeeklyActivity>;
