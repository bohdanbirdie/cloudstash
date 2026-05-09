import { memo } from "react";

import { SharedTooltipTrigger } from "@/components/ui/shared-tooltip";
import { cn } from "@/lib/utils";

import { bucket, BUCKET_CLASS, formatTooltipText } from "./build";

interface ActivityCellProps {
  count: number;
  dateLabel: string;
  isFuture: boolean;
  gridColumn: number;
  gridRow: number;
  tabbable: boolean;
  dataIdx: number;
}

export const ActivityCell = memo(function ActivityCell({
  count,
  dateLabel,
  isFuture,
  gridColumn,
  gridRow,
  tabbable,
  dataIdx,
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
    <SharedTooltipTrigger
      payload={tooltip}
      render={
        <button
          type="button"
          aria-label={tooltip}
          tabIndex={tabbable ? 0 : -1}
          data-cell-idx={dataIdx}
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
