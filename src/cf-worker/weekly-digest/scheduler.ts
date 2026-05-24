/// <reference types="@cloudflare/workers-types" />
import { Context, Duration, Effect, Layer, Option } from "effect";

import type { TierCapabilities } from "@/lib/plan";

import { OrgId } from "../db/branded";
import { maskId } from "../log-utils";
import type { WeeklyDigestRpcResult } from "./rpc";
import { droppedDeletion } from "./run-digest";
import type { WeeklyDigestTrigger } from "./runner";

const DIGEST_INTERVAL_MS = Duration.toMillis("7 days");

export interface DigestSchedulerDeps {
  readonly storage: DurableObjectStorage;
  readonly getStoreId: Effect.Effect<Option.Option<OrgId>>;
  readonly setStoreId: (id: OrgId) => Effect.Effect<void>;
  readonly getCapabilities: Effect.Effect<TierCapabilities>;
  readonly isDeletionTombstoned: Effect.Effect<boolean>;
  readonly runDigest: (
    storeId: OrgId,
    trigger: WeeklyDigestTrigger
  ) => Effect.Effect<WeeklyDigestRpcResult>;
}

export class DigestScheduler extends Context.Tag("DigestScheduler")<
  DigestScheduler,
  {
    readonly ensureScheduled: Effect.Effect<void>;
    readonly handleAlarm: Effect.Effect<void>;
    readonly triggerDigest: (
      storeId: OrgId
    ) => Effect.Effect<WeeklyDigestRpcResult>;
  }
>() {}

export const DigestSchedulerLive = (
  deps: DigestSchedulerDeps
): Layer.Layer<DigestScheduler> => {
  const ensureScheduled = Effect.gen(function* () {
    const storeIdOpt = yield* deps.getStoreId;
    if (Option.isNone(storeIdOpt)) {
      yield* Effect.logInfo("ensureScheduled: skip (no storeId)");
      return;
    }
    const storeId = storeIdOpt.value;
    yield* Effect.annotateCurrentSpan("storeId", maskId(storeId));

    const caps = yield* deps.getCapabilities;
    if (!caps.weeklyDigest) {
      yield* Effect.logInfo("ensureScheduled: skip (capability off)").pipe(
        Effect.annotateLogs({ storeId: maskId(storeId) })
      );
      return;
    }

    const existing = yield* Effect.promise(() => deps.storage.getAlarm());
    const nextAt = Date.now() + DIGEST_INTERVAL_MS;
    if (existing !== null && existing <= nextAt) {
      yield* Effect.logInfo("ensureScheduled: keep existing alarm").pipe(
        Effect.annotateLogs({
          existingAt: existing,
          inMs: existing - Date.now(),
          storeId: maskId(storeId),
        })
      );
      return;
    }

    yield* Effect.promise(() => deps.storage.setAlarm(nextAt));
    yield* Effect.logInfo("ensureScheduled: alarm set").pipe(
      Effect.annotateLogs({
        inMs: DIGEST_INTERVAL_MS,
        previousAt: existing,
        storeId: maskId(storeId),
      })
    );
  }).pipe(Effect.withSpan("WeeklyDigest.ensureScheduled"));

  const resolveStoreId = Effect.gen(function* () {
    const inMemory = yield* deps.getStoreId;
    if (Option.isSome(inMemory)) return inMemory;
    const stored = yield* Effect.promise(() =>
      deps.storage.get<string>("storeId")
    );
    if (!stored) return Option.none<OrgId>();
    const id = OrgId.make(stored);
    yield* deps.setStoreId(id);
    return Option.some(id);
  });

  const handleAlarm = Effect.gen(function* () {
    const resolved = yield* resolveStoreId;
    if (Option.isNone(resolved)) {
      yield* Effect.logWarning("Digest alarm: no storeId, exiting");
      return;
    }
    const storeId = resolved.value;
    yield* Effect.annotateCurrentSpan("storeId", maskId(storeId));

    if (yield* deps.isDeletionTombstoned) return;

    const caps = yield* deps.getCapabilities;
    if (!caps.weeklyDigest) return;

    yield* deps
      .runDigest(storeId, "alarm")
      .pipe(
        Effect.ensuring(
          Effect.promise(() =>
            deps.storage.setAlarm(Date.now() + DIGEST_INTERVAL_MS)
          )
        )
      );
  }).pipe(Effect.withSpan("WeeklyDigest.handleAlarm"));

  const triggerDigest = Effect.fn("WeeklyDigest.trigger")(function* (
    storeId: OrgId
  ) {
    yield* Effect.annotateCurrentSpan("storeId", maskId(storeId));

    if (yield* deps.isDeletionTombstoned) return droppedDeletion();

    yield* deps.setStoreId(storeId);
    yield* Effect.promise(() => deps.storage.put("storeId", storeId));

    return yield* deps.runDigest(storeId, "manual");
  });

  return Layer.succeed(DigestScheduler, {
    ensureScheduled,
    handleAlarm,
    triggerDigest,
  });
};
