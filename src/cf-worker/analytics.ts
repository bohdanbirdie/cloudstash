export function trackEvent(
  analytics: AnalyticsEngineDataset | undefined,
  params: { userId: string; event: string; orgId: string; status?: number }
): void {
  if (!analytics) return;
  analytics.writeDataPoint({
    indexes: [params.userId],
    blobs: [params.event, params.orgId],
    doubles: [params.status ?? 0],
  });
}

interface UsageRow {
  userId: string;
  event: string;
  count: number;
}

export async function queryUsage(
  accountId: string,
  apiToken: string,
  opts: { period: "24h" | "7d" | "30d"; dataset: string }
): Promise<{ rows: UsageRow[] }> {
  const intervalMap = { "24h": 1, "7d": 7, "30d": 30 } as const;
  const days = intervalMap[opts.period];

  const query = `
    SELECT
      index1 AS userId,
      blob1 AS event,
      count() AS count
    FROM ${opts.dataset}
    WHERE timestamp > NOW() - INTERVAL '${days}' DAY
    GROUP BY userId, event
    ORDER BY count DESC
  `;

  const resp = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "text/plain",
      },
      body: query,
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Analytics query failed: ${resp.status} ${text}`);
  }

  const json = (await resp.json()) as {
    data: { userId: string; event: string; count: number }[];
  };
  return { rows: json.data ?? [] };
}
