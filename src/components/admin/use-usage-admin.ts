import useSWR from "swr";

import { type AdminUser } from "@/types/api";

export type UsagePeriod = "24h" | "7d" | "30d";

interface UsageRow {
  userId: string;
  event: string;
  count: number;
}

interface UsageResponse {
  rows: UsageRow[];
  totals: { totalEvents: number; uniqueUsers: number };
}

export interface UserUsageSummary {
  userId: string;
  name: string;
  email: string;
  total: number;
  sync: number;
  sync_auth: number;
  auth: number;
  chat: number;
  ingest: number;
}

async function fetchUsage(key: string): Promise<UsageResponse> {
  const url = key.startsWith("/") ? key : `/${key}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(
      (body as { error?: string }).error ?? "Failed to fetch usage"
    );
  }
  return res.json() as Promise<UsageResponse>;
}

export function pivotRows(
  rows: UsageRow[],
  users: AdminUser[]
): UserUsageSummary[] {
  const userMap = new Map(users.map((u) => [u.id, u]));
  const byUser = new Map<string, UserUsageSummary>();

  for (const row of rows) {
    let entry = byUser.get(row.userId);
    if (!entry) {
      const user = userMap.get(row.userId);
      entry = {
        userId: row.userId,
        name: user?.name ?? row.userId.slice(0, 8),
        email: user?.email ?? "",
        total: 0,
        sync: 0,
        sync_auth: 0,
        auth: 0,
        chat: 0,
        ingest: 0,
      };
      byUser.set(row.userId, entry);
    }
    const event = row.event as keyof Pick<
      UserUsageSummary,
      "sync" | "sync_auth" | "auth" | "chat" | "ingest"
    >;
    if (event in entry) {
      entry[event] += row.count;
    }
    entry.total += row.count;
  }

  return Array.from(byUser.values()).toSorted((a, b) => b.total - a.total);
}

export function useUsageAdmin(
  period: UsagePeriod,
  users: AdminUser[],
  enabled = true
) {
  const { data, error, isLoading } = useSWR(
    enabled ? `/api/admin/usage?period=${period}` : null,
    fetchUsage
  );

  const summaries = data ? pivotRows(data.rows, users) : [];

  return {
    error: error?.message ?? null,
    isLoading,
    summaries,
    totals: data?.totals ?? { totalEvents: 0, uniqueUsers: 0 },
  };
}
