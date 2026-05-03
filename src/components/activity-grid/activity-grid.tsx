import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { CSSProperties } from "react";
import { memo, useMemo } from "react";

import { TooltipContent } from "@/components/ui/tooltip";
import { linkCreatedAts$ } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";

import {
  buildCells,
  buildDayLabels,
  buildMonthLabels,
  DAYS_PER_WEEK,
  WEEKS,
} from "./build";
import { ActivityCell } from "./cell";

const CELL_PX = 16;

const GRID_STYLE: CSSProperties = {
  gridTemplateColumns: `auto repeat(${WEEKS}, ${CELL_PX}px)`,
  gridTemplateRows: `auto repeat(${DAYS_PER_WEEK}, ${CELL_PX}px)`,
};

export const ActivityGrid = memo(function ActivityGrid() {
  const store = useAppStore();
  const rows = store.useQuery(linkCreatedAts$);

  const handle = useMemo(() => TooltipPrimitive.createHandle<string>(), []);

  const grid = useMemo(() => {
    const cells = buildCells(rows);
    return {
      cells,
      months: buildMonthLabels(cells),
      days: buildDayLabels(cells),
    };
  }, [rows]);

  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground">
        Activity
      </div>
      <TooltipPrimitive.Provider closeDelay={150}>
        <div className="mt-3 grid w-fit gap-0.5" style={GRID_STYLE}>
          {grid.months.map(({ index, label }) => (
            <span
              key={`m-${label}-${index}`}
              style={{ gridColumn: index + 2, gridRow: 1 }}
              className="text-[10px] leading-none whitespace-nowrap text-muted-foreground/70"
            >
              {label}
            </span>
          ))}

          {grid.days.map(({ index, label }) => (
            <span
              key={`d-${index}`}
              style={{ gridColumn: 1, gridRow: index + 2 }}
              className="self-center text-[10px] leading-none text-muted-foreground/70 pr-1"
            >
              {label}
            </span>
          ))}

          {grid.cells.map((cell, i) => (
            <ActivityCell
              key={cell.key}
              count={cell.count}
              dateLabel={cell.dateLabel}
              isFuture={cell.isFuture}
              gridColumn={Math.floor(i / DAYS_PER_WEEK) + 2}
              gridRow={(i % DAYS_PER_WEEK) + 2}
              handle={handle}
            />
          ))}
        </div>

        <TooltipPrimitive.Root handle={handle}>
          {({ payload }) => (
            <TooltipContent
              side="top"
              hideArrow
              className="pointer-events-none rounded-md data-[instant]:animate-none"
              positionerClassName="pointer-events-none"
            >
              {payload}
            </TooltipContent>
          )}
        </TooltipPrimitive.Root>
      </TooltipPrimitive.Provider>
    </div>
  );
});
