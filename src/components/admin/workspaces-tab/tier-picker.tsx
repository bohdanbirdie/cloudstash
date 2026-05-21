import { PLAN_ORDER } from "@/lib/plan";
import type { PlanTier } from "@/lib/plan";
import { MICRO_LABEL } from "@/lib/typography";
import { cn } from "@/lib/utils";

export function TierPicker({
  current,
  disabled,
  onChange,
}: {
  current: PlanTier;
  disabled: boolean;
  onChange: (tier: PlanTier) => void;
}) {
  return (
    <div
      className="border-border/60 inline-flex rounded-md border p-0.5"
      role="radiogroup"
      aria-label="Workspace tier"
    >
      {PLAN_ORDER.map((tier) => {
        const isActive = tier === current;
        return (
          <button
            key={tier}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`Set tier to ${tier}`}
            disabled={disabled || isActive}
            onClick={() => onChange(tier)}
            className={cn(
              MICRO_LABEL,
              "rounded-sm px-1.5 py-1 transition-colors",
              isActive
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50"
            )}
          >
            {tier}
          </button>
        );
      })}
    </div>
  );
}
