import { Effect } from "effect";

import { safeErrorInfo } from "../../log-utils";
import { runHandler } from "../../runtime";
import type { Env } from "../../shared";
import { assembleStats } from "./assemble";
import { COHORT_DAYS, DAY_MS, GROWTH_WEEKS, WEEK_MS } from "./constants";
import { weekStartMs } from "./helpers";
import { sourceBreakdown, weeklySignups } from "./metrics";
import { buildWeeklyActivity, enrichOrg } from "./model";
import { ActivityStatsRepo } from "./repo";

const internalError = () =>
  Response.json({ error: "Internal server error" }, { status: 500 });

export const handleGetActivityStats = (
  _request: Request,
  env: Env
): Promise<Response> =>
  runHandler(
    env,
    Effect.gen(function* () {
      const repo = yield* ActivityStatsRepo;
      const now = Date.now();
      const sevenDaysAgoMs = now - WEEK_MS;
      const cohortStartMs = now - COHORT_DAYS * DAY_MS;
      const windowStartMs = weekStartMs(now) - (GROWTH_WEEKS - 1) * WEEK_MS;

      const orgs = (yield* repo.orgFacts(sevenDaysAgoMs)).map(enrichOrg);
      const trackingStartMs = yield* repo.trackingStartMs();
      const weekly = buildWeeklyActivity(
        yield* repo.weeklySaves(windowStartMs)
      );
      const bySource = sourceBreakdown(
        yield* repo.savesBySource(cohortStartMs)
      );
      const signups = weeklySignups(orgs, windowStartMs);

      const stats = assembleStats({
        orgs,
        weekly,
        signups,
        bySource,
        trackingStartMs,
        windowStartMs,
        cohortStartMs,
      });

      yield* Effect.annotateCurrentSpan({
        totalOrgs: orgs.length,
        newUsersCurrent: stats.newUsers.current,
        activationRate: stats.activation.rate,
        weeklyActivePct: stats.weeklyActive.activePct,
        paidCount: stats.paidConversion.paidCount,
        paidActiveNow: stats.northStar.paidActiveNow,
        mrrUsd: stats.paidConversion.mrrUsd,
      });

      return Response.json(stats);
    }).pipe(
      Effect.withSpan("Admin.handleGetActivityStats"),
      Effect.catchTag("DbError", (cause) =>
        Effect.logError("getActivityStats DbError").pipe(
          Effect.annotateLogs(safeErrorInfo(cause)),
          Effect.as(internalError())
        )
      ),
      Effect.provide(ActivityStatsRepo.Default)
    )
  );
