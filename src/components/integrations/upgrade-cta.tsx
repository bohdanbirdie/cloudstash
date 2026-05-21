import { ArrowRightIcon, LockIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PlanTier } from "@/lib/plan";
import { PLANS } from "@/lib/plan";
import { useSettingsDialog } from "@/stores/settings-dialog-store";

interface UpgradeCtaProps {
  tier: PlanTier;
}

export function UpgradeCta({ tier }: UpgradeCtaProps) {
  const openSettingsAt = useSettingsDialog((s) => s.openAt);
  const tierName = PLANS[tier].name;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => openSettingsAt("plan")}>
        Upgrade to {tierName}
        <ArrowRightIcon />
      </Button>
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <LockIcon className="size-3" aria-hidden />
        Available on {tierName}
      </span>
    </div>
  );
}
