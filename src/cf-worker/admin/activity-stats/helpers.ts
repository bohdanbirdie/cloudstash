import { DAY_MS, GROWTH_WEEKS, WEEK_MS } from "./constants";

export const NO_ORGS: ReadonlySet<string> = new Set();

export const toMs = (value: unknown): number =>
  value instanceof Date
    ? value.getTime()
    : new Date(value as string | number).getTime();

export const isoDate = (ms: number): string =>
  new Date(ms).toISOString().slice(0, 10);

export const weekStartMs = (ms: number): number => {
  const d = new Date(ms);
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  return (
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
    mondayOffset * DAY_MS
  );
};

export const weekIndexOf = (ms: number, windowStartMs: number): number =>
  Math.floor((ms - windowStartMs) / WEEK_MS);

export const inGrowthWindow = (week: number): boolean =>
  week >= 0 && week < GROWTH_WEEKS;

export const trackingFloor = (
  startMs: number,
  trackingStartMs: number | null
): number =>
  trackingStartMs === null ? startMs : Math.max(startMs, trackingStartMs);

export const seriesByWeek = (valueAt: (week: number) => number): number[] =>
  Array.from({ length: GROWTH_WEEKS }, (_, w) => valueAt(w));

export const pct = (num: number, denom: number): number =>
  denom > 0 ? Math.round((num / denom) * 100) : 0;

export const pct1 = (num: number, denom: number): number =>
  denom > 0 ? Math.round((num / denom) * 1000) / 10 : 0;

export const round1 = (n: number): number => Math.round(n * 10) / 10;

export const dropFromPrev = (prev: number, curr: number): number =>
  prev > 0 ? Math.round(((prev - curr) / prev) * 100) : 0;

export const countIn = (
  ids: ReadonlySet<string>,
  candidates: Iterable<string>
): number => {
  let n = 0;
  for (const id of candidates) if (ids.has(id)) n += 1;
  return n;
};
