const numberFormatter = new Intl.NumberFormat("en-US");
const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
export const fmtNum = (n: number) => numberFormatter.format(n);
export const fmtUsd = (n: number) => usdFormatter.format(n);
export const fmtDepth = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 1 });

const WEEK_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
export const weekLabel = (iso: string) =>
  WEEK_LABEL.format(new Date(`${iso}T00:00:00Z`));
