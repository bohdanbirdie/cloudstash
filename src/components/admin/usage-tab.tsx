import { ActivityIcon, UsersIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";

import { type UsagePeriod, type UserUsageSummary } from "./use-usage-admin";

const PERIODS: { value: UsagePeriod; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

interface UsageTabProps {
  summaries: UserUsageSummary[];
  isLoading: boolean;
  error: string | null;
  totals: { totalEvents: number; uniqueUsers: number };
  period: UsagePeriod;
  onPeriodChange: (period: UsagePeriod) => void;
}

export function UsageTab({
  summaries,
  isLoading,
  error,
  totals,
  period,
  onPeriodChange,
}: UsageTabProps) {
  return (
    <TabsContent value="usage" className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <ActivityIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{totals.totalEvents}</span>
            <span className="text-muted-foreground">events</span>
          </div>
          <div className="flex items-center gap-1.5">
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{totals.uniqueUsers}</span>
            <span className="text-muted-foreground">active</span>
          </div>
        </div>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => onPeriodChange(p.value)}
              className={`px-2 py-0.5 text-xs rounded ${
                period === p.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : summaries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ActivityIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">No usage data yet</p>
          </div>
        ) : (
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2 font-medium w-[30%]">User</th>
                <th className="text-right py-2 font-medium w-[14%]">Total</th>
                <th className="text-right py-2 font-medium w-[14%]">Sync</th>
                <th className="text-right py-2 font-medium w-[14%]">Auth</th>
                <th className="text-right py-2 font-medium w-[14%]">Chat</th>
                <th className="text-right py-2 font-medium w-[14%]">Ingest</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((row) => (
                <tr key={row.userId} className="border-b last:border-0">
                  <td className="py-2">
                    <div className="text-xs font-medium truncate">
                      {row.name}
                    </div>
                    {row.email && (
                      <div className="text-xs text-muted-foreground truncate">
                        {row.email}
                      </div>
                    )}
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">
                    {row.total}
                  </td>
                  <td className="py-2 text-right text-muted-foreground tabular-nums">
                    {row.sync + row.sync_auth || "—"}
                  </td>
                  <td className="py-2 text-right text-muted-foreground tabular-nums">
                    {row.auth || "—"}
                  </td>
                  <td className="py-2 text-right text-muted-foreground tabular-nums">
                    {row.chat || "—"}
                  </td>
                  <td className="py-2 text-right text-muted-foreground tabular-nums">
                    {row.ingest || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </TabsContent>
  );
}
