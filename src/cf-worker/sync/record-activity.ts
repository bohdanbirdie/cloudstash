import { Effect } from "effect";

import { AppLayerLive } from "../auth/service";
import { createDb } from "../db";
import type { OrgId } from "../db/branded";
import { activityEvents } from "../db/schema";
import { safeErrorInfo } from "../log-utils";
import type { Env } from "../shared";
import { toActivityRows } from "./activity";
import type { PushEvent } from "./activity";

// D1 caps bound parameters at 100 per statement; a multi-row insert binds
// (rows × columns), so chunk by the live column count to stay under the cap.
const D1_MAX_BIND_PARAMS = 100;

export const recordActivity = (
  env: Env,
  storeId: OrgId,
  batch: readonly PushEvent[]
): void => {
  const rows = toActivityRows(storeId, batch);
  if (rows.length === 0) return;

  const db = createDb(env.DB);
  const colsPerRow = Object.keys(rows[0]).length;
  const chunkSize = Math.max(1, Math.floor(D1_MAX_BIND_PARAMS / colsPerRow));
  const chunks: (typeof rows)[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize));
  }

  Effect.runFork(
    Effect.forEach(
      chunks,
      (chunk) =>
        Effect.tryPromise(() =>
          db.insert(activityEvents).values(chunk).onConflictDoNothing()
        ).pipe(
          Effect.tapError((cause) =>
            Effect.logError("recordActivity chunk failed").pipe(
              Effect.annotateLogs(safeErrorInfo(cause))
            )
          ),
          Effect.catchAll(() => Effect.void)
        ),
      { discard: true }
    ).pipe(Effect.provide(AppLayerLive(env)))
  );
};
