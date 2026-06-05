import { TargetChip } from "./overview-target-chip";

export function Stat({
  label,
  value,
  sub,
  target,
  meets,
}: {
  label: string;
  value: string;
  sub: string;
  target?: number;
  meets?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {target !== undefined && <TargetChip target={target} meets={!!meets} />}
      </div>
      <div className="mt-1 font-mono text-xl font-semibold leading-none tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}
