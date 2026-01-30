import { formatHex, parse } from "culori";

export const oklchColors = {
  primary: "oklch(0.646 0.222 41.116)",
  primaryForeground: "oklch(0.98 0.016 73.684)",
  background: "oklch(1 0 0)",
  foreground: "oklch(0.141 0.005 285.823)",
  muted: "oklch(0.967 0.001 286.375)",
  mutedForeground: "oklch(0.552 0.016 285.938)",
  border: "oklch(0.92 0.004 286.32)",
} as const;

function toHex(oklch: string): string {
  const parsed = parse(oklch);
  if (!parsed) return "#000000";
  return formatHex(parsed) ?? "#000000";
}

export const hexColors = {
  primary: toHex(oklchColors.primary),
  primaryForeground: toHex(oklchColors.primaryForeground),
  background: toHex(oklchColors.background),
  foreground: toHex(oklchColors.foreground),
  muted: toHex(oklchColors.muted),
  mutedForeground: toHex(oklchColors.mutedForeground),
  border: toHex(oklchColors.border),
} as const;
