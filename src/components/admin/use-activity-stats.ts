import useSWR from "swr";

import type { ActivityStats } from "@/cf-worker/admin/activity-stats/types";

export type { ActivityStats } from "@/cf-worker/admin/activity-stats/types";
export type { FunnelStage } from "@/cf-worker/admin/activity-stats/types";
export type CohortFunnel = ActivityStats["cohortFunnel"];

async function fetchActivity(key: string): Promise<ActivityStats> {
  const url = key.startsWith("/") ? key : `/${key}`;
  const res = await fetch(url);
  if (!res.ok) {
    let body: { error?: string };
    try {
      body = await res.json();
    } catch {
      body = { error: "Request failed" };
    }
    throw new Error(body.error ?? "Failed to fetch activity");
  }
  const data: ActivityStats = await res.json();
  return data;
}

export function useActivityStats(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR(
    enabled ? "/api/admin/activity" : null,
    fetchActivity
  );

  return {
    data: data ?? null,
    error: error?.message ?? null,
    isLoading,
    refresh: () => {
      void mutate();
    },
  };
}
