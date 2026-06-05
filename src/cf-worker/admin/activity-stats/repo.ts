import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";

import * as schema from "../../db/schema";
import { DbClient, query } from "../../db/service";
import { WEEK_MS } from "./constants";
import { toMs } from "./helpers";

export class ActivityStatsRepo extends Effect.Service<ActivityStatsRepo>()(
  "@cloudstash/ActivityStatsRepo",
  {
    effect: Effect.gen(function* () {
      const db = yield* DbClient;
      const events = schema.activityEvents;
      const orgTable = schema.organization;

      return {
        orgFacts: Effect.fn("ActivityStatsRepo.orgFacts")(function* (
          sevenDaysAgoMs: number
        ) {
          const savesAgg = db.$with("saves_agg").as(
            db
              .select({
                organizationId: events.organizationId,
                saves: sql<number>`count(*)`.as("saves"),
                saves7d: sql<number>`
                  sum(case when ${events.occurredAt} >= ${sevenDaysAgoMs} then 1 else 0 end)
                `.as("saves7d"),
              })
              .from(events)
              .where(eq(events.type, "link_saved"))
              .groupBy(events.organizationId)
          );
          return yield* query(
            db
              .with(savesAgg)
              .select({
                id: orgTable.id,
                tier: orgTable.tier,
                subscriptionStatus: orgTable.subscriptionStatus,
                createdAt: orgTable.createdAt,
                saves: sql<number>`coalesce(${savesAgg.saves}, 0)`,
                saves7d: sql<number>`coalesce(${savesAgg.saves7d}, 0)`,
              })
              .from(orgTable)
              .leftJoin(savesAgg, eq(savesAgg.organizationId, orgTable.id))
          );
        }),

        trackingStartMs: Effect.fn("ActivityStatsRepo.trackingStartMs")(
          function* () {
            const rows = yield* query(
              db
                .select({
                  first: sql<number | null>`min(${events.occurredAt})`,
                })
                .from(events)
            );
            const first = rows[0]?.first;
            return first != null ? toMs(first) : null;
          }
        ),

        weeklySaves: Effect.fn("ActivityStatsRepo.weeklySaves")(function* (
          windowStartMs: number
        ) {
          return yield* query(
            db
              .select({
                organizationId: events.organizationId,
                week: sql<number>`(${events.occurredAt} - ${windowStartMs}) / ${WEEK_MS}`,
                saves: sql<number>`count(*)`,
              })
              .from(events)
              .where(
                sql`${events.type} = 'link_saved' and ${events.occurredAt} >= ${windowStartMs}`
              )
              .groupBy(
                events.organizationId,
                sql`(${events.occurredAt} - ${windowStartMs}) / ${WEEK_MS}`
              )
          );
        }),

        savesBySource: Effect.fn("ActivityStatsRepo.savesBySource")(function* (
          sinceMs: number
        ) {
          return yield* query(
            db
              .select({
                source: events.source,
                saves: sql<number>`count(*)`,
                orgs: sql<number>`count(distinct ${events.organizationId})`,
              })
              .from(events)
              .where(
                sql`${events.type} = 'link_saved' and ${events.occurredAt} >= ${sinceMs}`
              )
              .groupBy(events.source)
          );
        }),
      };
    }),
  }
) {}
