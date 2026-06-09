import { GemIcon } from "lucide-react";

import type { PlanTier } from "@/lib/plan";

type PlanIconType = typeof GemIcon;

export const PLAN_ICON: Record<PlanTier, PlanIconType | null> = {
  free: null,
  plus: GemIcon,
  pro: GemIcon,
};

export const UPGRADE_ICON: PlanIconType = GemIcon;
