import { fmtNum, fmtUsd } from "./overview-format";
import type { ActivityStats } from "./use-activity-stats";

const SOURCE_LABELS: Record<string, string> = {
  app: "Web app",
  raycast: "Raycast",
  telegram: "Telegram",
  chrome: "Chrome extension",
  "chrome-ext": "Chrome extension",
  shortcut: "iOS Shortcut",
  unknown: "Unknown",
};

const sourceLabel = (source: string): string =>
  SOURCE_LABELS[source] ?? source.charAt(0).toUpperCase() + source.slice(1);

export function TierBreakdown({
  rows,
  showMrr,
}: {
  rows: ActivityStats["byTier"];
  showMrr: boolean;
}) {
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="border-b text-xs text-muted-foreground">
          <th className="w-[34%] py-2 text-left font-medium">Plan</th>
          <th className="w-[22%] py-2 text-right font-medium">Users</th>
          <th
            className="w-[22%] py-2 text-right font-medium"
            title="Saved a link in the last 7 days"
          >
            Active
          </th>
          {showMrr && (
            <th className="w-[22%] py-2 text-right font-medium">MRR</th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.tier} className="border-b last:border-0">
            <td className="py-2 text-xs capitalize">{row.tier}</td>
            <td className="py-2 text-right font-mono tabular-nums">
              {fmtNum(row.users)}
            </td>
            <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">
              {row.activePct}%
            </td>
            {showMrr && (
              <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">
                {row.mrrContribution > 0 ? fmtUsd(row.mrrContribution) : "—"}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SourceBreakdown({ rows }: { rows: ActivityStats["bySource"] }) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No saves recorded in this window yet.
      </p>
    );
  }
  const top = rows[0]?.saves ?? 0;
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const width = top > 0 ? Math.max((row.saves / top) * 100, 2) : 0;
        return (
          <div key={row.source}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate">{sourceLabel(row.source)}</span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                <span className="font-medium text-foreground">
                  {fmtNum(row.saves)}
                </span>{" "}
                saves · {row.sharePct}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground/25"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
