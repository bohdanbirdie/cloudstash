import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { BillingInterval } from "@/lib/plan";
import { maxYearlySavingsPct } from "@/lib/plan";
import { cn } from "@/lib/utils";

export function IntervalToggle({
  value,
  onChange,
  className,
  showSavings = true,
}: {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
  className?: string;
  showSavings?: boolean;
}) {
  const savingsPct = maxYearlySavingsPct();
  const withBadge = showSavings && savingsPct > 0;

  return (
    <div className={cn("inline-flex", className)}>
      <ToggleGroup<BillingInterval>
        value={[value]}
        onValueChange={(values) => {
          const next = values[0];
          if (next && next !== value) onChange(next);
        }}
        aria-label="Billing interval"
      >
        <ToggleGroupItem value="month" className="h-7 px-3 text-xs">
          Monthly
        </ToggleGroupItem>
        <ToggleGroupItem value="year" className="relative h-7 px-3 text-xs">
          Yearly
          {withBadge && (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute -top-2 -right-2.5 select-none rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground ring-2 ring-background"
              >
                −{savingsPct}%
              </span>
              <span className="sr-only"> — save {savingsPct}%</span>
            </>
          )}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
