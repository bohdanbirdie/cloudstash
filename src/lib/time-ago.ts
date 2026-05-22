const rtf = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
  style: "narrow",
});

const UNITS: Array<{
  threshold: number;
  divisor: number;
  unit: Intl.RelativeTimeFormatUnit;
}> = [
  { threshold: 60, divisor: 1, unit: "second" },
  { threshold: 3600, divisor: 60, unit: "minute" },
  { threshold: 86400, divisor: 3600, unit: "hour" },
  { threshold: 604800, divisor: 86400, unit: "day" },
  { threshold: 2629800, divisor: 604800, unit: "week" },
  { threshold: 31557600, divisor: 2629800, unit: "month" },
];

export function formatAgo(date: Date | number | null | undefined): string {
  if (date == null) return "";
  const ms = typeof date === "number" ? date : date.getTime();
  const diffSeconds = (Date.now() - ms) / 1000;
  const abs = Math.abs(diffSeconds);
  const sign = diffSeconds >= 0 ? -1 : 1;

  for (const { threshold, divisor, unit } of UNITS) {
    if (abs < threshold) {
      return rtf.format(sign * Math.round(abs / divisor), unit);
    }
  }
  return rtf.format(sign * Math.round(abs / 31557600), "year");
}
