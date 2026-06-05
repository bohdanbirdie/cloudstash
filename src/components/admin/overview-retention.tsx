import { Match } from "effect";

import { cn } from "@/lib/utils";

import { fmtNum, weekLabel } from "./overview-format";
import type { ActivityStats } from "./use-activity-stats";

const retentionTint = (retainedPct: number): string =>
  Match.value(retainedPct).pipe(
    Match.when(
      (p) => p >= 75,
      () => "bg-green-600/90 text-white"
    ),
    Match.when(
      (p) => p >= 50,
      () => "bg-green-600/55"
    ),
    Match.when(
      (p) => p >= 25,
      () => "bg-green-600/30"
    ),
    Match.when(
      (p) => p > 0,
      () => "bg-green-600/12"
    ),
    Match.orElse(() => "bg-muted/50 text-muted-foreground")
  );

export function RetentionHeatmap({
  grid,
}: {
  grid: ActivityStats["retention"];
}) {
  if (grid.cohorts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Not enough signups since tracking began to chart retention yet.
      </p>
    );
  }
  const ages = Array.from({ length: grid.maxAge + 1 }, (_, i) => i);
  return (
    <div>
      <p className="mb-2 max-w-[70ch] text-[11px] text-muted-foreground">
        Each row is the users who signed up that week. Each column is how many
        weeks later. Greener = more of them were still saving links.
      </p>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1 text-[11px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="px-1 text-left font-medium">Signup week</th>
              <th className="px-1 text-right font-medium">Users</th>
              {ages.map((a) => (
                <th
                  key={a}
                  className="px-1 text-center font-medium tabular-nums"
                  title={`${a} weeks after signup`}
                >
                  +{a}w
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.cohorts.map((cohort) => (
              <tr key={cohort.weekStart}>
                <td className="whitespace-nowrap px-1 text-muted-foreground">
                  {weekLabel(cohort.weekStart)}
                </td>
                <td className="px-1 text-right font-mono tabular-nums text-muted-foreground">
                  {fmtNum(cohort.size)}
                </td>
                {ages.map((a) => {
                  const cell = cohort.cells[a];
                  if (!cell) return <td key={a} />;
                  return (
                    <td
                      key={a}
                      className={cn(
                        "rounded-[3px] px-1.5 py-1 text-center font-mono tabular-nums",
                        retentionTint(cell.retainedPct)
                      )}
                      title={`${cell.retained} of ${cohort.size} still saving, ${a} weeks after signup`}
                    >
                      {cell.retainedPct}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>fewer active</span>
        <span className="h-3 w-4 rounded-[2px] bg-green-600/12" />
        <span className="h-3 w-4 rounded-[2px] bg-green-600/30" />
        <span className="h-3 w-4 rounded-[2px] bg-green-600/55" />
        <span className="h-3 w-4 rounded-[2px] bg-green-600/90" />
        <span>more active</span>
      </div>
    </div>
  );
}
