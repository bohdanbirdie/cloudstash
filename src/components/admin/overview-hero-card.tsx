import { Sparkline } from "./overview-charts";
import { DeltaBadge } from "./overview-delta-badge";
import { fmtNum } from "./overview-format";
import { TargetChip } from "./overview-target-chip";
import type { ActivityStats } from "./use-activity-stats";

export function HeroCard({
  ns,
  target,
  weekStarts,
}: {
  ns: ActivityStats["northStar"];
  target: number;
  weekStarts?: string[];
}) {
  const meets = ns.activePct >= target;
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Paying users active this week
        </span>
        {ns.paidCount > 0 && <TargetChip target={target} meets={meets} />}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="font-mono text-4xl font-semibold leading-none tabular-nums">
          {fmtNum(ns.paidActiveNow)}
        </span>
        {ns.paidCount > 0 && <DeltaBadge delta={ns.delta} />}
      </div>
      {ns.paidCount > 0 ? (
        <>
          <div className="mt-2 text-xs text-muted-foreground">
            {ns.activePct}% of {fmtNum(ns.paidCount)} paying users saved a link
            in the last 7 days
          </div>
          {ns.churnRisk > 0 && (
            <div className="mt-1 text-xs">
              <span className="font-medium text-amber-600 dark:text-amber-500">
                {fmtNum(ns.churnRisk)}
              </span>
              <span className="text-muted-foreground">
                {" "}
                haven’t saved in 7 days — at risk of churning
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="mt-2 text-xs text-muted-foreground">
          No paying users yet — convert some free users first.
        </div>
      )}
      <div className="mt-2 h-12">
        {ns.sparkline.length >= 2 ? (
          <Sparkline
            data={ns.sparkline}
            weekStarts={weekStarts}
            valueLabel="paying active"
            className="aspect-auto h-12 w-full"
          />
        ) : (
          <div className="flex h-12 items-end text-[10px] text-muted-foreground">
            not enough weeks yet
          </div>
        )}
      </div>
    </div>
  );
}
