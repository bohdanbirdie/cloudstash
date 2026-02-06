import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const UsageIndicator = ({
  usage,
}: {
  usage: { used: number; limit: number; budget: number };
}) => {
  const percent = Math.min(Math.round((usage.used / usage.limit) * 100), 100);
  const spent = usage.budget * (usage.used / usage.limit);
  const isWarning = percent >= 80;
  const isCritical = percent >= 90;

  const size = 16;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (percent / 100) * circumference;

  const strokeColor = isCritical
    ? "stroke-destructive"
    : isWarning
      ? "stroke-amber-500"
      : "stroke-primary";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="p-1 rounded-md hover:bg-muted transition-colors"
          >
            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              className="-rotate-90"
            >
              {/* Background circle */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={strokeWidth}
                className="stroke-muted"
              />
              {/* Progress circle */}
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
      <TooltipContent side="bottom" align="end">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-4">
            <span>Monthly usage</span>
            <span className="font-medium tabular-nums">
              ${spent.toFixed(2)} / ${usage.budget.toFixed(2)}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-background/20 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                isCritical
                  ? "bg-destructive"
                  : isWarning
                    ? "bg-amber-500"
                    : "bg-primary"
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
