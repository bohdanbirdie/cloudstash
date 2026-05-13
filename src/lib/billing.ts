import { toast } from "sonner";

import type { PlanTier } from "@/lib/plan";
import { PLANS } from "@/lib/plan";

/**
 * Single entry point for plan changes. Stripe Checkout (for upgrades from
 * Free) and the Stripe Customer Portal (for changes between paid tiers and
 * downgrades) replace the toast stub when billing ships — call sites stay
 * the same.
 */
export function changePlan(target: PlanTier) {
  const plan = PLANS[target];
  toast(`Opening checkout for ${plan.name}…`, {
    description: "Stripe wiring lands soon.",
  });
}
