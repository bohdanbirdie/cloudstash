const MS_PER_DAY = 86_400_000;

export function isoWeek(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7
  );
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
