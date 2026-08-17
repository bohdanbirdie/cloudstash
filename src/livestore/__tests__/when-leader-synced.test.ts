import { describe, expect, it } from "@effect/vitest";
import { Clock, Effect } from "effect";
import { TestClock } from "effect/testing";

import { makeSerializedBarrierQueue } from "../when-leader-synced";

describe("makeSerializedBarrierQueue", () => {
  it.effect("includes predecessor wait in the caller timeout budget", () =>
    Effect.gen(function* () {
      const clock = yield* TestClock.make();
      const queue = makeSerializedBarrierQueue<object>();
      const key = {};
      let releasePredecessor!: () => void;
      const predecessor = new Promise<void>((resolve) => {
        releasePredecessor = resolve;
      });
      let queuedBarrierRuns = 0;
      const run = (effect: Effect.Effect<boolean>) =>
        effect.pipe(
          Effect.provideService(Clock.Clock, clock),
          Effect.runPromise
        );

      const first = queue.enqueue(
        key,
        Effect.promise(() => predecessor),
        10_000,
        run
      );
      const queued = queue.enqueue(
        key,
        Effect.sync(() => {
          queuedBarrierRuns += 1;
        }),
        1_000,
        run
      );

      yield* clock.adjust(1_000);

      expect(yield* Effect.promise(() => queued)).toBe(false);
      expect(queuedBarrierRuns).toBe(0);

      releasePredecessor();
      expect(yield* Effect.promise(() => first)).toBe(true);
      expect(queuedBarrierRuns).toBe(0);
    })
  );

  it.effect("runs a subsequent barrier after its predecessor times out", () =>
    Effect.gen(function* () {
      const clock = yield* TestClock.make();
      const queue = makeSerializedBarrierQueue<object>();
      const key = {};
      let subsequentBarrierRuns = 0;
      const run = (effect: Effect.Effect<boolean>) =>
        effect.pipe(
          Effect.provideService(Clock.Clock, clock),
          Effect.runPromise
        );

      const timedOut = queue.enqueue(key, Effect.never, 1_000, run);
      const subsequent = queue.enqueue(
        key,
        Effect.sync(() => {
          subsequentBarrierRuns += 1;
        }),
        10_000,
        run
      );

      yield* clock.adjust(1_000);

      expect(yield* Effect.promise(() => timedOut)).toBe(false);
      expect(yield* Effect.promise(() => subsequent)).toBe(true);
      expect(subsequentBarrierRuns).toBe(1);
    })
  );
});
