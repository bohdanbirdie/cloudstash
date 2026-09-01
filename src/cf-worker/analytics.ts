import { Effect, Schema } from "effect";
import { HttpBody, HttpClient, HttpClientRequest } from "effect/unstable/http";

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

const UsageResponse = Schema.Struct({
  data: Schema.optional(
    Schema.NullOr(
      Schema.Array(
        Schema.Struct({
          userId: Schema.String,
          event: Schema.String,
          count: Schema.String,
        })
      )
    )
  ),
});

export const queryUsage = Effect.fn("Analytics.queryUsage")(function* (
  accountId: string,
  apiToken: string,
  opts: { period: "24h" | "7d" | "30d"; dataset: string }
) {
  const intervalMap = { "24h": 1, "7d": 7, "30d": 30 } as const;
  const days = intervalMap[opts.period];
  const client = yield* HttpClient.HttpClient;

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

  const request = HttpClientRequest.post(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`,
    {
      headers: { Authorization: `Bearer ${apiToken}` },
      body: HttpBody.text(query, "text/plain"),
    }
  );
  const resp = yield* client.execute(request).pipe(
    Effect.mapError(
      (cause) =>
        new AnalyticsQueryError({
          message: cause.message,
          statusCode: 0,
        })
    )
  );

  if (resp.status < 200 || resp.status >= 300) {
    const text = yield* resp.text.pipe(
      Effect.mapError(
        () =>
          new AnalyticsQueryError({
            message: `Analytics query failed: ${resp.status}`,
            statusCode: resp.status,
          })
      )
    );
    return yield* new AnalyticsQueryError({
      message: `Analytics query failed: ${resp.status} ${text}`,
      statusCode: resp.status,
    });
  }

  const json = yield* resp.json.pipe(
    Effect.mapError(
      (cause) =>
        new AnalyticsQueryError({ message: cause.message, statusCode: 0 })
    )
  );
  const body = yield* Schema.decodeUnknownEffect(UsageResponse)(json).pipe(
    Effect.mapError(
      (cause) =>
        new AnalyticsQueryError({ message: cause.message, statusCode: 0 })
    )
  );

  return {
    rows: (body.data ?? []).map((r): UsageRow => ({
      ...r,
      count: Number(r.count),
    })),
  };
});
