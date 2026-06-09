import { cn } from "@/lib/utils";

import type { CohortFunnel, FunnelStage } from "./use-activity-stats";

const FUNNEL_LABELS: Record<FunnelStage, string> = {
  signedUp: "Signed up",
  activated: "Saved 1+ links",
  engaged: "Saved 2+ links",
  active7d: "Saved in the last 7 days",
};

export function CohortFunnelView({ funnel }: { funnel: CohortFunnel }) {
  const top = funnel.stages[0]?.count ?? 0;
  return (
    <div className="space-y-2">
      {funnel.stages.map((stage, i) => {
        const width = top > 0 ? Math.max((stage.count / top) * 100, 2) : 0;
        const isWorst =
          funnel.biggestDropStage === stage.stage && stage.dropPct > 0;
        return (
          <div key={stage.stage}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate">
                {FUNNEL_LABELS[stage.stage]}
                {isWorst && (
                  <span className="ml-1.5 rounded bg-destructive/10 px-1 py-0.5 text-[10px] font-medium text-destructive">
                    biggest drop-off
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                <span className="font-medium text-foreground">
                  {stage.pct}%
                </span>
                {i > 0 && stage.dropPct > 0 && (
                  <span
                    className={cn("ml-1", {
                      "text-destructive": isWorst,
                      "text-muted-foreground": !isWorst,
                    })}
                  >
                    −{stage.dropPct}%
                  </span>
                )}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", {
                  "bg-destructive/70": isWorst,
                  "bg-primary": !isWorst,
                })}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
