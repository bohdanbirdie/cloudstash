export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;
export const GROWTH_WEEKS = 12;
export const COHORT_DAYS = 30;

export const TARGETS = {
  paidActivePct: 90,
  activationPct: 40,
  weeklyActivePct: 30,
  paidConversionPct: 4,
} as const;

export const PAYING_STATUSES = new Set(["active", "trialing", "past_due"]);
