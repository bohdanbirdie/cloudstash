import { queryUsage } from "../analytics";
import { logSync } from "../logger";
import { type Env } from "../shared";

const logger = logSync("Admin");

const VALID_PERIODS = new Set(["24h", "7d", "30d"]);

export async function handleGetUsage(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "24h";

  if (!VALID_PERIODS.has(period)) {
    return Response.json(
      { error: "Invalid period. Use 24h, 7d, or 30d" },
      { status: 400 }
    );
  }

  const dataset = env.BETTER_AUTH_URL?.includes("staging")
    ? "cloudstash_usage_staging"
    : "cloudstash_usage";

  try {
    const { rows } = await queryUsage(
      env.CF_ACCOUNT_ID,
      env.CF_ANALYTICS_TOKEN,
      {
        period: period as "24h" | "7d" | "30d",
        dataset,
      }
    );

    const totalEvents = rows.reduce((sum, r) => sum + r.count, 0);
    const uniqueUsers = new Set(rows.map((r) => r.userId)).size;

    logger.info("Usage query", { period, totalEvents, uniqueUsers });

    return Response.json({ rows, totals: { totalEvents, uniqueUsers } });
  } catch (error) {
    logger.error("Usage query failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: "Failed to query usage data" },
      { status: 500 }
    );
  }
}
