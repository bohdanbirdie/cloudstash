import { Effect, Schema } from "effect";

export class AnalyticsQueryError extends Schema.TaggedError<AnalyticsQueryError>()(
  "AnalyticsQueryError",
  {
    message: Schema.String,
    statusCode: Schema.Number,
  }
) {}

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

export const queryUsage = Effect.fn("Analytics.queryUsage")(function* (
  accountId: string,
  apiToken: string,
  opts: { period: "24h" | "7d" | "30d"; dataset: string }
) {
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

  const resp = yield* Effect.tryPromise({
    catch: (cause) =>
      new AnalyticsQueryError({
        message: cause instanceof Error ? cause.message : String(cause),
        statusCode: 0,
      }),
    try: () =>
      fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "text/plain",
          },
          body: query,
        }
      ),
  });

  if (!resp.ok) {
    const text = yield* Effect.tryPromise({
      catch: () =>
        new AnalyticsQueryError({
          message: `Analytics query failed: ${resp.status}`,
          statusCode: resp.status,
        }),
      try: () => resp.text(),
    });
    return yield* new AnalyticsQueryError({
      message: `Analytics query failed: ${resp.status} ${text}`,
      statusCode: resp.status,
    });
  }

  const json = yield* Effect.tryPromise({
    catch: (cause) =>
      new AnalyticsQueryError({
        message: cause instanceof Error ? cause.message : String(cause),
        statusCode: 0,
      }),
    try: (): Promise<{
      data: { userId: string; event: string; count: string }[];
    }> => resp.json(),
  });

  return {
    rows: (json.data ?? []).map(
      (r): UsageRow => ({
        ...r,
        count: Number(r.count),
      })
    ),
  };
});
