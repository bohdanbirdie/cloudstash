import type { Store } from "@livestore/livestore";
import { Effect, Layer } from "effect";

import type { schema } from "../../livestore/schema";
import type { OrgId } from "../db/branded";
import { maskId, safeErrorInfo } from "../log-utils";
import type { Env } from "../shared";
import type {
  DigestEventSinkError,
  DigestLinkSourceError,
  WeeklyDigestGenerateError,
} from "./errors";
import { OpenRouterApiKeyLive, WeeklyDigestGenerator } from "./generator";
import type { WeeklyDigestFailureReason, WeeklyDigestRpcResult } from "./rpc";
import { runDigest } from "./runner";
import type { WeeklyDigestTrigger } from "./runner";
import { DigestEventSinkLive } from "./services/digest-event-sink.live";
import { DigestLinkSourceLive } from "./services/digest-link-source.live";

const failed = (
  reason: WeeklyDigestFailureReason,
  message: string
): WeeklyDigestRpcResult => ({
  message,
  reason,
  status: "failed",
});

export const droppedDeletion = (): WeeklyDigestRpcResult => ({
  status: "dropped-deletion",
});

export interface DigestFailureContext {
  readonly storeId: OrgId;
  readonly trigger: WeeklyDigestTrigger;
}

export const mapDigestFailures = <A>(
  effect: Effect.Effect<
    A,
    DigestEventSinkError | DigestLinkSourceError | WeeklyDigestGenerateError
  >,
  ctx: DigestFailureContext
): Effect.Effect<A | WeeklyDigestRpcResult> => {
  const { storeId, trigger } = ctx;
  return effect.pipe(
    Effect.catchTags({
      DigestEventSinkError: (e) =>
        Effect.logError("Weekly digest failed: event-sink").pipe(
          Effect.annotateLogs({
            message: e.message,
            operation: e.operation,
            storeId: maskId(storeId),
            trigger,
          }),
          Effect.as(failed("event-sink", e.message))
        ),
      DigestLinkSourceError: (e) =>
        Effect.logError("Weekly digest failed: link-source").pipe(
          Effect.annotateLogs({
            message: e.message,
            operation: e.operation,
            storeId: maskId(storeId),
            trigger,
          }),
          Effect.as(failed("link-source", e.message))
        ),
      WeeklyDigestGenerateError: (e) =>
        Effect.logError("Weekly digest failed: generator").pipe(
          Effect.annotateLogs({
            linkCount: e.linkCount,
            message: e.message,
            model: e.model,
            statusCode: e.statusCode,
            storeId: maskId(storeId),
            trigger,
          }),
          Effect.as(failed("generator", e.message))
        ),
    }),
    Effect.catchAllDefect((defect) =>
      Effect.logError("Weekly digest failed: defect").pipe(
        Effect.annotateLogs({
          ...safeErrorInfo(defect),
          defectName:
            defect instanceof Error ? defect.constructor.name : typeof defect,
          storeId: maskId(storeId),
          trigger,
        }),
        Effect.as(
          failed(
            "defect",
            defect instanceof Error ? defect.message : String(defect)
          )
        )
      )
    )
  );
};

export interface RunDigestGenerationParams {
  readonly store: Store<typeof schema>;
  readonly env: Env;
  readonly storeId: OrgId;
  readonly trigger: WeeklyDigestTrigger;
}

export const runDigestGeneration = Effect.fn(
  "WeeklyDigest.runDigestGeneration"
)(function* (params: RunDigestGenerationParams) {
  const { env, store, storeId, trigger } = params;
  yield* Effect.annotateCurrentSpan("storeId", maskId(storeId));
  yield* Effect.annotateCurrentSpan("trigger", trigger);

  const layer = Layer.mergeAll(
    DigestLinkSourceLive(store),
    DigestEventSinkLive(store),
    WeeklyDigestGenerator.Default.pipe(
      Layer.provide(OpenRouterApiKeyLive(env.OPENROUTER_API_KEY))
    )
  );

  return yield* mapDigestFailures(
    runDigest({ now: new Date(), trigger }).pipe(Effect.provide(layer)),
    { storeId, trigger }
  );
});
