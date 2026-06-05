import { Array as Arr, Option, Record as Rec, pipe } from "effect";

import { PLAN_ORDER } from "@/lib/plan";

import { COHORT_DAYS, GROWTH_WEEKS, WEEK_MS } from "./constants";
import {
  countIn,
  dropFromPrev,
  inGrowthWindow,
  isoDate,
  NO_ORGS,
  pct,
  pct1,
  round1,
  seriesByWeek,
  trackingFloor,
  weekIndexOf,
} from "./helpers";
import type { WeeklyActivity } from "./model";
import type { FunnelStage, Org, RetentionCohort } from "./types";

export const paidConversionMetric = (orgs: Org[]) => {
  const paid = orgs.filter((o) => o.isPaying);
  return {
    conversionPct: pct1(paid.length, orgs.length),
    paidCount: paid.length,
    totalOrgs: orgs.length,
    mrrUsd: paid.reduce((sum, o) => sum + o.priceUsd, 0),
  };
};

export const weeklyActiveMetric = (
  orgs: Org[],
  { activeOrgsByWeek }: WeeklyActivity
) => {
  const activeCount = orgs.filter((o) => o.isActive7d).length;
  return {
    activePct: pct(activeCount, orgs.length),
    activeCount,
    totalOrgs: orgs.length,
    sparkline: seriesByWeek((w) => activeOrgsByWeek.get(w)?.size ?? 0),
  };
};

export const northStarMetric = (
  orgs: Org[],
  { activeOrgsByWeek }: WeeklyActivity
) => {
  const paid = orgs.filter((o) => o.isPaying);
  const paidIds = new Set(paid.map((o) => o.id));
  const paidActiveNow = paid.filter((o) => o.isActive7d).length;
  const sparkline = seriesByWeek((w) =>
    countIn(activeOrgsByWeek.get(w) ?? NO_ORGS, paidIds)
  );
  return {
    paidActiveNow,
    paidCount: paid.length,
    activePct: pct(paidActiveNow, paid.length),
    churnRisk: paid.length - paidActiveNow,
    delta: paidActiveNow - (sparkline[GROWTH_WEEKS - 2] ?? 0),
    sparkline,
  };
};

export const depthMetric = (
  orgs: Org[],
  { activeOrgsByWeek, savesByWeek }: WeeklyActivity
) => {
  const active = orgs.filter((o) => o.isActive7d);
  const totalSaves7d = active.reduce((sum, o) => sum + o.saves7d, 0);
  const perActive =
    active.length > 0 ? round1(totalSaves7d / active.length) : 0;
  const sparkline = seriesByWeek((w) => {
    const size = activeOrgsByWeek.get(w)?.size ?? 0;
    return size > 0 ? round1(savesByWeek[w] / size) : 0;
  });
  return {
    perActive,
    delta: round1(perActive - (sparkline[GROWTH_WEEKS - 2] ?? 0)),
    sparkline,
  };
};

export const weeklySignups = (orgs: Org[], windowStartMs: number) => {
  const weeks = orgs.map((o) => weekIndexOf(o.createdAtMs, windowStartMs));
  return {
    counts: seriesByWeek((w) => weeks.filter((week) => week === w).length),
    before: weeks.filter((week) => week < 0).length,
  };
};

export const userGrowthSeries = (
  counts: number[],
  before: number,
  windowStartMs: number
) =>
  counts.map((signups, week) => ({
    weekStart: isoDate(windowStartMs + week * WEEK_MS),
    signups,
    cumulative:
      before + counts.slice(0, week + 1).reduce((sum, n) => sum + n, 0),
  }));

export const newUsersMetric = (counts: number[]) => {
  const current = counts[GROWTH_WEEKS - 1];
  const prior = counts[GROWTH_WEEKS - 2] ?? 0;
  return { current, prior, delta: current - prior, sparkline: counts.slice() };
};

export const activationMetric = (
  orgs: Org[],
  trackingStartMs: number | null,
  windowStartMs: number
) => {
  const cohort =
    trackingStartMs === null
      ? []
      : orgs.filter((o) => o.createdAtMs >= trackingStartMs);
  const activatedCount = cohort.filter((o) => o.saves >= 1).length;
  const byWeek = pipe(
    cohort.filter((o) =>
      inGrowthWindow(weekIndexOf(o.createdAtMs, windowStartMs))
    ),
    Arr.groupBy((o) => String(weekIndexOf(o.createdAtMs, windowStartMs))),
    Rec.map((members) => {
      const activated = members.filter((o) => o.saves >= 1).length;
      return pct(activated, members.length);
    })
  );
  return {
    rate: pct(activatedCount, cohort.length),
    activatedCount,
    cohortSize: cohort.length,
    sparkline: seriesByWeek((w) => byWeek[w] ?? 0),
  };
};

const FUNNEL_STAGES: { stage: FunnelStage; reached: (o: Org) => boolean }[] = [
  { stage: "signedUp", reached: () => true },
  { stage: "activated", reached: (o) => o.saves >= 1 },
  { stage: "engaged", reached: (o) => o.saves >= 2 },
  { stage: "active7d", reached: (o) => o.isActive7d },
];

export const cohortFunnel = (
  orgs: Org[],
  cohortStartMs: number,
  trackingStartMs: number | null
) => {
  const floorMs = trackingFloor(cohortStartMs, trackingStartMs);
  const cohort = orgs.filter((o) => o.createdAtMs >= floorMs);
  const counts = FUNNEL_STAGES.map(
    (s) => cohort.filter((o) => s.reached(o)).length
  );
  const top = counts[0];
  const stages = FUNNEL_STAGES.map((s, i) => ({
    stage: s.stage,
    count: counts[i],
    pct: pct(counts[i], top),
    dropPct: i === 0 ? 0 : dropFromPrev(counts[i - 1], counts[i]),
  }));
  const biggestDrop = stages
    .slice(1)
    .filter((s) => s.dropPct > 0)
    .toSorted((a, b) => b.dropPct - a.dropPct)[0];
  return {
    cohortDays: COHORT_DAYS,
    trackingScoped: floorMs > cohortStartMs,
    stages,
    biggestDropStage: biggestDrop?.stage ?? null,
  };
};

export const retentionGrid = (
  orgs: Org[],
  { activeOrgsByWeek }: WeeklyActivity,
  windowStartMs: number,
  trackingStartMs: number | null
) => {
  const floorMs = trackingFloor(windowStartMs, trackingStartMs);
  const membersByCohort = pipe(
    orgs.filter(
      (o) =>
        o.createdAtMs >= floorMs &&
        inGrowthWindow(weekIndexOf(o.createdAtMs, windowStartMs))
    ),
    Arr.groupBy((o) => String(weekIndexOf(o.createdAtMs, windowStartMs))),
    Rec.map((members) => members.map((o) => o.id))
  );
  const cohorts: RetentionCohort[] = pipe(
    Arr.makeBy(GROWTH_WEEKS, (week) => week),
    Arr.filterMap((week) => {
      const members = membersByCohort[week];
      if (!members?.length) return Option.none();
      const cells = Arr.makeBy(GROWTH_WEEKS - week, (age) => {
        const retained = countIn(
          activeOrgsByWeek.get(week + age) ?? NO_ORGS,
          members
        );
        return { age, retained, retainedPct: pct(retained, members.length) };
      });
      return Option.some({
        weekStart: isoDate(windowStartMs + week * WEEK_MS),
        size: members.length,
        cells,
      });
    })
  );
  return {
    cohorts,
    maxAge: cohorts.reduce((max, c) => Math.max(max, c.cells.length - 1), 0),
  };
};

export const tierBreakdown = (orgs: Org[]) =>
  PLAN_ORDER.map((tier) => {
    const inTier = orgs.filter((o) => o.tier === tier);
    const activeCount = inTier.filter((o) => o.isActive7d).length;
    return {
      tier,
      users: inTier.length,
      activePct: pct(activeCount, inTier.length),
      mrrContribution: inTier.reduce((sum, o) => sum + o.priceUsd, 0),
    };
  });

export const sourceBreakdown = (
  rows: { source: string | null; saves: number; orgs: number }[]
) => {
  const total = rows.reduce((sum, r) => sum + Number(r.saves), 0);
  return rows
    .map((r) => ({
      source: r.source ?? "unknown",
      saves: Number(r.saves),
      activeOrgs: Number(r.orgs),
      sharePct: pct1(Number(r.saves), total),
    }))
    .toSorted((a, b) => b.saves - a.saves);
};
