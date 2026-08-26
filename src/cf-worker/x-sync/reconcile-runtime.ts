import { Cause, Effect, Layer } from "effect";

import { DbClientLive } from "../db/service";
import type { Env } from "../shared";
import { OtelTracingLive } from "../tracing";
import {
  handleXReconcileBatchEffect,
  XReconcileQueue,
} from "./reconcile-queue";
import { enqueueAllXReconciles } from "./reconcile-triggers";
import { XSyncControl } from "./services/x-sync-control";

export const handleXReconcileBatch = (
  batch: MessageBatch,
  env: Env
): Promise<void> =>
  Effect.runPromise(
    handleXReconcileBatchEffect(batch).pipe(
      Effect.tapCause((cause) =>
        Effect.logError("X reconciliation batch failed").pipe(
          Effect.annotateLogs({
            batchSize: batch.messages.length,
            cause: Cause.pretty(cause),
          })
        )
      ),
      Effect.provide(
        Layer.mergeAll(
          XSyncControl.layer(env.X_BOOKMARK_SYNC_DO),
          OtelTracingLive
        )
      ),
      Effect.asVoid
    )
  );

export const runXReconcileRepair = (env: Env): Promise<void> =>
  Effect.runPromise(
    enqueueAllXReconciles().pipe(
      Effect.tap((count) =>
        Effect.logInfo("X reconciliation repair enqueued").pipe(
          Effect.annotateLogs({ count })
        )
      ),
      Effect.tapCause((cause) =>
        Effect.logError("X reconciliation repair failed").pipe(
          Effect.annotateLogs({ cause: Cause.pretty(cause) })
        )
      ),
      Effect.provide(
        Layer.mergeAll(
          DbClientLive(env.DB),
          XReconcileQueue.layer(env.X_RECONCILE_QUEUE),
          OtelTracingLive
        )
      ),
      Effect.asVoid
    )
  );
