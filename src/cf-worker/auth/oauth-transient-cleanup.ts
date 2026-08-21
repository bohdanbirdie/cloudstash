import { lt } from "drizzle-orm";
import { Clock, Effect } from "effect";

import * as schema from "../db/schema";
import { DbClient, query } from "../db/service";

const CLEANUP_INTERVAL_MS = 5 * 60 * 1_000;
const nextCleanupAt = new WeakMap<D1Database, number>();

export const cleanupExpiredOAuthTransientRecords = Effect.fnUntraced(function* (
  d1: D1Database
) {
  const db = yield* DbClient;
  const now = yield* Clock.currentTimeMillis;
  if (now < (nextCleanupAt.get(d1) ?? 0)) return;

  nextCleanupAt.set(d1, now + CLEANUP_INTERVAL_MS);
  yield* Effect.all(
    [
      query(
        db
          .delete(schema.verification)
          .where(lt(schema.verification.expiresAt, new Date(now)))
      ),
      query(
        db
          .delete(schema.oauthClientAssertion)
          .where(lt(schema.oauthClientAssertion.expiresAt, new Date(now)))
      ),
    ],
    { concurrency: 1, discard: true }
  ).pipe(
    Effect.tapError(() =>
      Effect.sync(() => {
        nextCleanupAt.delete(d1);
      })
    )
  );
});
