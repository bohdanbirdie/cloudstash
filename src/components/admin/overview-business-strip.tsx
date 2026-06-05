import { fmtNum, fmtUsd } from "./overview-format";
import { Stat } from "./overview-stat";
import type { ActivityStats } from "./use-activity-stats";

export function BusinessStrip({
  pc,
  conversionTarget,
}: {
  pc: ActivityStats["paidConversion"];
  conversionTarget: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 rounded-lg border p-3">
      <Stat
        label="Free → paid conversion"
        value={`${pc.conversionPct}%`}
        sub={`${fmtNum(pc.paidCount)} of ${fmtNum(pc.totalOrgs)} users are paying`}
        target={conversionTarget}
        meets={pc.conversionPct >= conversionTarget}
      />
      <Stat
        label="Monthly revenue"
        value={pc.mrrUsd > 0 ? fmtUsd(pc.mrrUsd) : "—"}
        sub={pc.mrrUsd > 0 ? "recurring (MRR)" : "No active subscriptions"}
      />
    </div>
  );
}
