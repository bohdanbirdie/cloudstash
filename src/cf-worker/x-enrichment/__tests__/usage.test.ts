import { describe, it } from "@effect/vitest";
import { DateTime, Effect, Result } from "effect";
import { expect } from "vitest";

import { OrgId } from "../../db/branded";
import { EnrichmentUsage } from "../usage";

class FakeStorage {
  private readonly values = new Map<string, unknown>();
  private transactionTail: Promise<unknown> = Promise.resolve();
  transactionError: Error | null = null;

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }

  private runTransaction<T>(
    transactionFn: (transaction: DurableObjectTransaction) => Promise<T>
  ): Promise<T> {
    return transactionFn(this as unknown as DurableObjectTransaction);
  }

  transaction<T>(
    transactionFn: (transaction: DurableObjectTransaction) => Promise<T>
  ): Promise<T> {
    const run = this.transactionTail.then(async () => {
      if (this.transactionError) throw this.transactionError;
      return this.runTransaction(transactionFn);
    });
    this.transactionTail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

const runWithStorage = <A, E>(
  storage: FakeStorage,
  effect: Effect.Effect<A, E, EnrichmentUsage>
): Effect.Effect<A, E> =>
  effect.pipe(
    Effect.provide(
      EnrichmentUsage.layer({
        storage: storage as unknown as DurableObjectStorage,
      })
    )
  );

describe("EnrichmentUsage", () => {
  const orgId = OrgId.make("org-1");
  let settlement = 0;
  const input = (cap: number) => ({
    cap,
    settlementId: `settlement-${settlement++}`,
    windowId: "window-1",
  });

  it.effect("atomically refuses concurrent reservations beyond the cap", () =>
    Effect.gen(function* () {
      const storage = new FakeStorage();
      const reserve = EnrichmentUsage.pipe(
        Effect.flatMap((usage) =>
          Effect.suspend(() => usage.reserve(orgId, input(10)))
        )
      );

      const reservations = yield* Effect.all(
        Array.from({ length: 25 }, () => runWithStorage(storage, reserve)),
        { concurrency: "unbounded" }
      );

      expect(reservations.filter(({ reserved }) => reserved)).toHaveLength(10);
      expect(reservations.filter(({ reserved }) => !reserved)).toHaveLength(15);
      expect(Math.max(...reservations.map(({ used }) => used))).toBe(10);
    })
  );

  it.effect("increments successful reservations monotonically", () =>
    Effect.gen(function* () {
      const storage = new FakeStorage();
      const first = yield* runWithStorage(
        storage,
        EnrichmentUsage.pipe(
          Effect.flatMap((usage) => usage.reserve(orgId, input(100)))
        )
      );
      const second = yield* runWithStorage(
        storage,
        EnrichmentUsage.pipe(
          Effect.flatMap((usage) => usage.reserve(orgId, input(100)))
        )
      );
      expect(first).toMatchObject({ reserved: true, used: 1 });
      expect(second).toMatchObject({ reserved: true, used: 2 });
    })
  );

  it.effect("does not double-charge a repeated settlement", () =>
    Effect.gen(function* () {
      const storage = new FakeStorage();
      const repeated = {
        cap: 100,
        settlementId: "same-settlement",
        windowId: "window-1",
      };
      const reserve = EnrichmentUsage.pipe(
        Effect.flatMap((usage) => usage.reserve(orgId, repeated))
      );

      const first = yield* runWithStorage(storage, reserve);
      const retry = yield* runWithStorage(storage, reserve);

      expect(first).toMatchObject({ reserved: true, used: 1 });
      expect(retry).toMatchObject({ reserved: true, used: 1 });
    })
  );

  it.effect("continues from the deployed calendar-month counter", () =>
    Effect.gen(function* () {
      const storage = new FakeStorage();
      const legacyPeriod = (yield* DateTime.nowAsDate)
        .toISOString()
        .slice(0, 7);
      yield* Effect.promise(() =>
        storage.put(`enrichment:${orgId}:${legacyPeriod}`, 7)
      );

      const reservation = yield* runWithStorage(
        storage,
        EnrichmentUsage.pipe(
          Effect.flatMap((usage) => usage.reserve(orgId, input(10)))
        )
      );

      expect(reservation).toMatchObject({ reserved: true, used: 8 });
    })
  );

  it.effect("fails closed when the storage transaction is unavailable", () =>
    Effect.gen(function* () {
      const storage = new FakeStorage();
      storage.transactionError = new Error("storage unavailable");
      const result = yield* runWithStorage(
        storage,
        Effect.result(
          EnrichmentUsage.pipe(
            Effect.flatMap((usage) => usage.reserve(orgId, input(100)))
          )
        )
      );
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({
          _tag: "EnrichmentUsageTransactionError",
          storeId: orgId,
        });
      }
    })
  );
});
