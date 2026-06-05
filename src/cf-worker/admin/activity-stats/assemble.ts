import { COHORT_DAYS, TARGETS } from "./constants";
import {
  activationMetric,
  cohortFunnel,
  depthMetric,
  newUsersMetric,
  northStarMetric,
  paidConversionMetric,
  retentionGrid,
  sourceBreakdown,
  tierBreakdown,
  userGrowthSeries,
  weeklyActiveMetric,
} from "./metrics";
import type { WeeklyActivity } from "./model";
import type { Org } from "./types";

export interface AssembleInput {
  orgs: Org[];
  weekly: WeeklyActivity;
  signups: { counts: number[]; before: number };
  bySource: ReturnType<typeof sourceBreakdown>;
  trackingStartMs: number | null;
  windowStartMs: number;
  cohortStartMs: number;
}

export const assembleStats = ({
  orgs,
  weekly,
  signups,
  bySource,
  trackingStartMs,
  windowStartMs,
  cohortStartMs,
}: AssembleInput) => ({
  northStar: northStarMetric(orgs, weekly),
  depth: depthMetric(orgs, weekly),
  newUsers: newUsersMetric(signups.counts),
  activation: activationMetric(orgs, trackingStartMs, windowStartMs),
  weeklyActive: weeklyActiveMetric(orgs, weekly),
  paidConversion: paidConversionMetric(orgs),
  userGrowth: userGrowthSeries(signups.counts, signups.before, windowStartMs),
  cohortFunnel: cohortFunnel(orgs, cohortStartMs, trackingStartMs),
  retention: retentionGrid(orgs, weekly, windowStartMs, trackingStartMs),
  byTier: tierBreakdown(orgs),
  bySource,
  sourceWindowDays: COHORT_DAYS,
  targets: TARGETS,
  trackingStartMs,
});

export type ActivityStats = ReturnType<typeof assembleStats>;
