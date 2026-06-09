import { usePaywall } from "@/stores/paywall-store";

export type UpgradeParam = "plus" | "pro" | "1";

export function parseUpgradeParam(value: unknown): UpgradeParam | undefined {
  if (value === "plus" || value === "pro") return value;
  return value ? "1" : undefined;
}

export function openPaywallForIntent(upgrade: UpgradeParam): void {
  usePaywall
    .getState()
    .openPaywall(upgrade === "1" ? undefined : { highlightTier: upgrade });
}
