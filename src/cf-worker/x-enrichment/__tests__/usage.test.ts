import { Effect, Result } from "effect";
import { describe, expect, it } from "vitest";

import { OrgId } from "../../db/branded";
import { EnrichmentUsage, EnrichmentUsageLive } from "../usage";

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
): Promise<A> =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(
        EnrichmentUsageLive({
          storage: storage as unknown as DurableObjectStorage,
        })
      )
    )
  );

describe("EnrichmentUsage", () => {
  const orgId = OrgId.make("org-1");

  it("atomically refuses concurrent reservations beyond the cap", async () => {
    const storage = new FakeStorage();
    const reserve = EnrichmentUsage.pipe(
      Effect.flatMap((usage) => usage.reserve(orgId, 10))
    );

    const reservations = await Promise.all(
      Array.from({ length: 25 }, () => runWithStorage(storage, reserve))
    );

    expect(reservations.filter(({ reserved }) => reserved)).toHaveLength(10);
    expect(reservations.filter(({ reserved }) => !reserved)).toHaveLength(15);
    expect(Math.max(...reservations.map(({ used }) => used))).toBe(10);
  });

  it("increments successful reservations monotonically", async () => {
    const storage = new FakeStorage();
    const first = await runWithStorage(
      storage,
      EnrichmentUsage.pipe(Effect.flatMap((usage) => usage.reserve(orgId, 100)))
    );
    const second = await runWithStorage(
      storage,
      EnrichmentUsage.pipe(Effect.flatMap((usage) => usage.reserve(orgId, 100)))
    );
    expect(first).toMatchObject({ reserved: true, used: 1 });
    expect(second).toMatchObject({ reserved: true, used: 2 });
  });

  it("fails closed when the storage transaction is unavailable", async () => {
    const storage = new FakeStorage();
    storage.transactionError = new Error("storage unavailable");
    const result = await runWithStorage(
      storage,
      Effect.result(
        EnrichmentUsage.pipe(
          Effect.flatMap((usage) => usage.reserve(orgId, 100))
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
  });
});
