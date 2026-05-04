import type { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import { Trash2Icon } from "lucide-react";
import { useRef } from "react";

import {
  PreviewCard,
  PreviewCardContent,
  PreviewCardTrigger,
} from "@/components/ui/preview-card";
import { cn } from "@/lib/utils";

interface UsageIndicatorProps {
  usage: { used: number; limit: number; budget: number };
  onClear?: () => void;
}

export const UsageIndicator = ({ usage, onClear }: UsageIndicatorProps) => {
  const actionsRef = useRef<PreviewCardPrimitive.Root.Actions | null>(null);
  const percent = Math.min(Math.round((usage.used / usage.limit) * 100), 100);
  const spent = usage.budget * (usage.used / usage.limit);
  const isWarning = percent >= 80;
  const isCritical = percent >= 90;

  const size = 14;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (percent / 100) * circumference;

  const strokeColor = isCritical
    ? "stroke-destructive"
    : isWarning
      ? "stroke-amber-500"
      : "stroke-primary";

  const barColor = isCritical
    ? "bg-destructive"
    : isWarning
      ? "bg-amber-500"
      : "bg-primary";

  return (
    <PreviewCard actionsRef={actionsRef}>
      <PreviewCardTrigger
        delay={120}
        closeDelay={260}
        render={
          <button
            type="button"
            aria-label={`Monthly usage: $${spent.toFixed(2)} of $${usage.budget.toFixed(2)}`}
            className="flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
          >
            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              className="-rotate-90"
            >
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={strokeWidth}
                className="stroke-muted"
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - filled}
                className={cn(strokeColor, "transition-all duration-300")}
              />
            </svg>
          </button>
        }
      />
      <PreviewCardContent
        side="bottom"
        align="start"
        sideOffset={8}
        className="w-56 rounded-lg p-1"
      >
        <div className="flex flex-col">
          <div className="flex flex-col gap-1.5 px-2 pt-1 pb-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Monthly usage</span>
              <span className="font-medium tabular-nums">
                ${spent.toFixed(2)} / ${usage.budget.toFixed(2)}
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  barColor
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
          {onClear && (
            <>
              <div className="border-t border-border py-0.5 mx-1" />
              <button
                type="button"
                onClick={() => {
                  onClear();
                  actionsRef.current?.close();
                }}
                className="flex h-7 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none"
              >
                <Trash2Icon className="size-3" />
                Clear conversation
              </button>
            </>
          )}
        </div>
      </PreviewCardContent>
    </PreviewCard>
  );
};
