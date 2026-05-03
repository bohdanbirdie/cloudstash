import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { memo } from "react";

import { cn } from "@/lib/utils";

import { bucket, BUCKET_CLASS, formatTooltipText } from "./build";

interface ActivityCellProps {
  count: number;
  dateLabel: string;
  isFuture: boolean;
  gridColumn: number;
  gridRow: number;
  handle: TooltipPrimitive.Handle<string>;
}

export const ActivityCell = memo(function ActivityCell({
  count,
  dateLabel,
  isFuture,
  gridColumn,
  gridRow,
  handle,
}: ActivityCellProps) {
  if (isFuture) {
    return (
      <div aria-hidden="true" style={{ gridColumn, gridRow }} className="p-px">
        <div className="size-3.5 rounded-[3px] bg-muted/30" />
      </div>
    );
  }

  const tooltip = formatTooltipText(count, dateLabel);

  return (
    <TooltipPrimitive.Trigger
      handle={handle}
      payload={tooltip}
      render={
        <button
          type="button"
          aria-label={tooltip}
          style={{ gridColumn, gridRow }}
          className="cursor-default p-px focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50 rounded-[3px]"
        >
          <div
            className={cn(
              "size-3.5 rounded-[3px]",
              BUCKET_CLASS[bucket(count)]
            )}
          />
        </button>
      }
    />
  );
});
