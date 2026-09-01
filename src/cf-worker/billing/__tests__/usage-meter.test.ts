import { describe, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { expect } from "vitest";

import { UsageMeter } from "../usage-meter";

class TestStorage {
  private readonly values = new Map<string, unknown>();
  private tail: Promise<unknown> = Promise.resolve();
  getError: Error | null = null;
  putError: Error | null = null;
  transactionError: Error | null = null;

  async get<T>(key: string): Promise<T | undefined> {
    if (this.getError) throw this.getError;
    return this.values.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    if (this.putError) throw this.putError;
    this.values.set(key, value);
  }

  transaction<T>(
    run: (transaction: DurableObjectTransaction) => Promise<T>
  ): Promise<T> {
    const next = this.tail.then(() => {
      if (this.transactionError) throw this.transactionError;
      return run(this as unknown as DurableObjectTransaction);
    });
    this.tail = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }
}

const runWith = <A, E>(
  storage: TestStorage,
  effect: Effect.Effect<A, E, UsageMeter>
) =>
  effect.pipe(
    Effect.provide(UsageMeter.layer(storage as unknown as DurableObjectStorage))
  );

describe("UsageMeter", () => {
  it.effect("admits no more than the limit under concurrent reservations", () =>
    Effect.gen(function* () {
      const storage = new TestStorage();
      const reserve = (settlementId: string) =>
        UsageMeter.pipe(
          Effect.flatMap((meter) =>
            meter.reserve({
              limit: 10,
              metric: "aiSummaries",
              settlementId,
              windowId: "window-1",
            })
          )
        );

      const results = yield* Effect.all(
        Array.from({ length: 25 }, (_, index) =>
          runWith(storage, reserve(`summary-${index}`))
        ),
        { concurrency: "unbounded" }
      );

      expect(
        results.filter((result) => result.status === "reserved")
      ).toHaveLength(10);
      expect(
        results.filter((result) => result.status === "limit_reached")
      ).toHaveLength(15);
    })
  );

  it.effect(
    "does not double-charge the same settlement and isolates windows",
    () =>
      Effect.gen(function* () {
        const storage = new TestStorage();
        const reserve = (windowId: string) =>
          UsageMeter.pipe(
            Effect.flatMap((meter) =>
              meter.reserve({
                limit: 2,
                metric: "xEnrichments",
                settlementId: "link-1",
                windowId,
              })
            )
          );

        const first = yield* runWith(storage, reserve("window-1"));
        const retry = yield* runWith(storage, reserve("window-1"));
        const nextMonth = yield* runWith(storage, reserve("window-2"));

        expect(first).toMatchObject({ count: 1, status: "reserved" });
        expect(retry).toMatchObject({ count: 1, status: "duplicate" });
        expect(nextMonth).toMatchObject({ count: 1, status: "reserved" });
      })
  );

  it.effect("returns empty usage and treats a zero limit as exhausted", () =>
    Effect.gen(function* () {
      const storage = new TestStorage();
      const empty = yield* runWith(
        storage,
        UsageMeter.pipe(
          Effect.flatMap((meter) => meter.get("aiSummaries", "window-1"))
        )
      );
      const denied = yield* runWith(
        storage,
        UsageMeter.pipe(
          Effect.flatMap((meter) =>
            meter.reserve({
              limit: 0,
              metric: "aiSummaries",
              windowId: "window-1",
            })
          )
        )
      );

      expect(empty).toEqual({ count: 0, settlements: [] });
      expect(denied).toEqual({ count: 0, status: "limit_reached" });
    })
  );

  it.effect("rejects invalid limits and malformed persisted usage", () =>
    Effect.gen(function* () {
      const storage = new TestStorage();
      const invalidLimit = yield* runWith(
        storage,
        Effect.result(
          UsageMeter.pipe(
            Effect.flatMap((meter) =>
              meter.reserve({
                limit: -1,
                metric: "aiSummaries",
                windowId: "window-1",
              })
            )
          )
        )
      );
      yield* Effect.promise(() =>
        storage.put("counted-usage:aiSummaries:broken", { count: "bad" })
      );
      const malformed = yield* runWith(
        storage,
        Effect.result(
          UsageMeter.pipe(
            Effect.flatMap((meter) => meter.get("aiSummaries", "broken"))
          )
        )
      );

      expect(Result.isFailure(invalidLimit)).toBe(true);
      if (Result.isFailure(invalidLimit)) {
        expect(invalidLimit.failure).toMatchObject({
          _tag: "UsageMeterStorageError",
          operation: "validate-limit",
        });
      }
      expect(Result.isFailure(malformed)).toBe(true);
      if (Result.isFailure(malformed)) {
        expect(malformed.failure).toMatchObject({
          _tag: "UsageMeterStorageError",
          operation: "decode",
        });
      }
    })
  );

  it.effect("maps storage read, transaction, and write failures", () =>
    Effect.gen(function* () {
      const readStorage = new TestStorage();
      readStorage.getError = new Error("read failed");
      const read = yield* runWith(
        readStorage,
        Effect.result(
          UsageMeter.pipe(
            Effect.flatMap((meter) => meter.get("aiSummaries", "window-1"))
          )
        )
      );

      const transactionStorage = new TestStorage();
      transactionStorage.transactionError = new Error("transaction failed");
      const transaction = yield* runWith(
        transactionStorage,
        Effect.result(
          UsageMeter.pipe(
            Effect.flatMap((meter) =>
              meter.reserve({
                limit: 1,
                metric: "aiSummaries",
                windowId: "window-1",
              })
            )
          )
        )
      );

      const writeStorage = new TestStorage();
      writeStorage.putError = new Error("write failed");
      const write = yield* runWith(
        writeStorage,
        Effect.result(
          UsageMeter.pipe(
            Effect.flatMap((meter) =>
              meter.reserve({
                limit: 1,
                metric: "aiSummaries",
                windowId: "window-1",
              })
            )
          )
        )
      );

      const assertStorageFailure = (
        result: Result.Result<unknown, unknown>
      ) => {
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({
            _tag: "UsageMeterStorageError",
          });
        }
      };
      assertStorageFailure(read);
      assertStorageFailure(transaction);
      assertStorageFailure(write);
    })
  );
});
