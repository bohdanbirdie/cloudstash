export const WEEKS = 26;
export const DAYS_PER_WEEK = 7;

const TOTAL_DAYS = WEEKS * DAYS_PER_WEEK;
const MIN_MONTH_LABEL_GAP = 2;
const DAY_LABELS_TO_SHOW = new Set(["Mon", "Wed", "Fri"]);

export const BUCKET_CLASS = [
  "bg-muted/60",
  "bg-primary/25",
  "bg-primary/55",
  "bg-primary",
] as const;

const dateLabelFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const dayShortFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
});
const monthShortFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
});

export interface Cell {
  key: string;
  date: Date;
  dateLabel: string;
  count: number;
  isFuture: boolean;
}

export interface AxisLabel {
  index: number;
  label: string;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function bucket(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  return 3;
}

export function formatTooltipText(count: number, dateLabel: string): string {
  const noun = count === 1 ? "link" : "links";
  const counter = count === 0 ? "No links" : `${count} ${noun}`;
  return `${counter} · ${dateLabel}`;
}

export function buildCells(rows: readonly { createdAt: number }[]): Cell[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = dayKey(new Date(row.createdAt));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dowMon = (today.getDay() + 6) % 7;
  const todayIndex = (WEEKS - 1) * DAYS_PER_WEEK + dowMon;
  const start = new Date(today);
  start.setDate(today.getDate() - todayIndex);

  const cells: Cell[] = [];
  for (let i = 0; i < TOTAL_DAYS; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d);
    cells.push({
      key,
      date: d,
      dateLabel: dateLabelFormatter.format(d),
      count: counts.get(key) ?? 0,
      isFuture: i > todayIndex,
    });
  }
  return cells;
}

export function buildMonthLabels(cells: readonly Cell[]): AxisLabel[] {
  const labels: AxisLabel[] = [];
  let lastMonth = -1;
  let lastKeptIndex = Number.NEGATIVE_INFINITY;
  for (let col = 0; col < WEEKS; col++) {
    const firstDay = cells[col * DAYS_PER_WEEK];
    if (!firstDay) continue;
    const m = firstDay.date.getMonth();
    if (m === lastMonth) continue;
    lastMonth = m;
    if (col - lastKeptIndex < MIN_MONTH_LABEL_GAP) continue;
    labels.push({
      index: col,
      label: monthShortFormatter.format(firstDay.date),
    });
    lastKeptIndex = col;
  }
  return labels;
}

export function buildDayLabels(cells: readonly Cell[]): AxisLabel[] {
  const labels: AxisLabel[] = [];
  for (let row = 0; row < DAYS_PER_WEEK; row++) {
    const sample = cells[row];
    if (!sample) continue;
    const weekday = dayShortFormatter.format(sample.date);
    if (DAY_LABELS_TO_SHOW.has(weekday)) {
      labels.push({ index: row, label: weekday });
    }
  }
  return labels;
}
