import { useCallback, useRef } from "react";

import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MICRO_LABEL } from "@/lib/typography";
import { cn } from "@/lib/utils";

export function BudgetInput({
  override,
  tierDefault,
  disabled,
  onCommit,
  onClear,
}: {
  override: number | undefined;
  tierDefault: number;
  disabled: boolean;
  onCommit: (value: number) => void;
  onClear: () => void;
}) {
  const isOverridden = override !== undefined;
  const effective = override ?? tierDefault;
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = useCallback(() => {
    const raw = inputRef.current?.value.trim() ?? "";
    const parsed = Number.parseFloat(raw);
    if (Number.isNaN(parsed) || parsed < 0) {
      if (inputRef.current) inputRef.current.value = String(effective);
      return;
    }
    const rounded = Math.round(parsed * 100) / 100;
    if (inputRef.current) inputRef.current.value = String(rounded);
    if (rounded === tierDefault) {
      if (isOverridden) onClear();
      return;
    }
    if (rounded !== effective) onCommit(rounded);
  }, [effective, tierDefault, isOverridden, onCommit, onClear]);

  return (
    <div className="flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className={cn(
                MICRO_LABEL,
                "text-muted-foreground hover:text-foreground rounded-sm cursor-help focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
              )}
            >
              Chat / mo
            </button>
          }
        />
        <TooltipContent>
          <div className="flex flex-col gap-0.5 text-xs">
            <span>Monthly Assistant credits</span>
            <span className="text-muted-foreground">
              Tier default is {tierDefault}. Type a different number to set a
              custom allowance; select reset to use the default again.
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
      <div className="relative">
        <Input
          key={`${tierDefault}:${override ?? "default"}`}
          ref={inputRef}
          aria-label="Monthly Assistant credits"
          type="number"
          min="0"
          step="1"
          defaultValue={String(effective)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              inputRef.current?.blur();
            } else if (e.key === "Escape") {
              if (inputRef.current) inputRef.current.value = String(effective);
              inputRef.current?.blur();
            }
          }}
          disabled={disabled}
          className={cn(
            "h-6 w-16 px-1.5 text-right font-mono text-xs tabular-nums",
            { "ring-primary/40 font-medium ring-1": isOverridden }
          )}
        />
      </div>
      {isOverridden && (
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          aria-label={`Reset Assistant credits to tier default ${tierDefault}`}
          className="text-muted-foreground hover:text-foreground rounded-sm text-[10px] underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none disabled:opacity-50"
        >
          reset
        </button>
      )}
    </div>
  );
}
