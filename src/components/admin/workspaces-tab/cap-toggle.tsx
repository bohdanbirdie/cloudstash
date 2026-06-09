import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MICRO_LABEL } from "@/lib/typography";
import { cn } from "@/lib/utils";

export function CapToggle({
  effective,
  override,
  disabled,
  label,
  short,
  onClick,
}: {
  effective: boolean;
  override: boolean | undefined;
  disabled: boolean;
  label: string;
  short: string;
  onClick: () => void;
}) {
  const isOverridden = override !== undefined;
  const dotClass = isOverridden
    ? override
      ? "bg-primary"
      : "bg-foreground/40"
    : "bg-transparent";
  const ariaLabel = isOverridden
    ? `${label}: override ${override ? "on" : "off"}. Click to cycle.`
    : `${label}: inherits tier default (${effective ? "on" : "off"}). Click to cycle.`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            aria-label={ariaLabel}
            aria-pressed={isOverridden ? !!override : "mixed"}
            className={cn(
              MICRO_LABEL,
              "relative rounded-sm px-1.5 py-1 transition-colors",
              {
                "bg-primary/10 text-foreground": effective,
                "bg-foreground/[0.04] text-muted-foreground": !effective,
              },
              "hover:bg-primary/15 disabled:opacity-50"
            )}
          >
            {short}
            <span
              aria-hidden
              className={cn(
                "absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full",
                dotClass
              )}
            />
          </button>
        }
      />
      <TooltipContent>
        <div className="flex flex-col gap-0.5 text-xs">
          <span>{label}</span>
          <span className="text-muted-foreground">
            {isOverridden
              ? `Override: ${override ? "on" : "off"}`
              : `Tier default: ${effective ? "on" : "off"}`}
          </span>
          <span className="text-muted-foreground">Click to cycle</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
