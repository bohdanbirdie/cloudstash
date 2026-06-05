import { Sparkline } from "./overview-charts";
import { DeltaBadge } from "./overview-delta-badge";
import { TargetChip } from "./overview-target-chip";

export function MetricCard({
  label,
  value,
  sub,
  delta,
  target,
  meetsTarget,
  sparkline,
  sparklineWeeks,
  sparklineLabel,
  sparklineUnit = "count",
}: {
  label: string;
  value: string;
  sub: string;
  delta?: number;
  target?: number;
  meetsTarget?: boolean;
  sparkline: number[];
  sparklineWeeks?: string[];
  sparklineLabel: string;
  sparklineUnit?: "count" | "percent";
}) {
  return (
    <div className="flex flex-col justify-between rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {delta !== undefined && <DeltaBadge delta={delta} />}
      </div>
      <div className="mt-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-mono text-2xl font-semibold leading-none tabular-nums">
            {value}
          </div>
          {target !== undefined && (
            <TargetChip target={target} meets={!!meetsTarget} />
          )}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
      </div>
      <div className="mt-2 h-9">
        {sparkline.length >= 2 ? (
          <Sparkline
            data={sparkline}
            weekStarts={sparklineWeeks}
            valueLabel={sparklineLabel}
            unit={sparklineUnit}
          />
        ) : (
          <div className="flex h-9 items-end text-[10px] text-muted-foreground">
            not enough weeks yet
          </div>
        )}
      </div>
    </div>
  );
}
