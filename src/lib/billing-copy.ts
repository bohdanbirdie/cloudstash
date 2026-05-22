export const PLAN_CHANGE_COPY = {
  upgrade: "Unlocks now — you’ll pay the difference on your next invoice.",
  downgrade:
    "Takes effect at your next renewal — you keep your current features until then.",
  cancel: "Runs until your next renewal, then switches to Free.",
  summary:
    "Upgrades unlock now. Switching down or canceling takes effect at your next renewal — you keep your current features until then.",
} as const;

export function formatRenewalDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function cancelKeepsFeaturesCopy(planName: string): string {
  return `You keep every ${planName} feature until then — after that, your workspace moves to Free.`;
}
