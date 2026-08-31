import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { UsageMeter, UsageMeterLive } from "../usage-meter";

class TestStorage {
  private readonly values = new Map<string, unknown>();
  private tail: Promise<unknown> = Promise.resolve();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }

  transaction<T>(
    run: (transaction: DurableObjectTransaction) => Promise<T>
  ): Promise<T> {
    const next = this.tail.then(() =>
      run(this as unknown as DurableObjectTransaction)
    );
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
  Effect.runPromise(
    effect.pipe(
      Effect.provide(UsageMeterLive(storage as unknown as DurableObjectStorage))
    )
  );

describe("UsageMeter", () => {
  it("admits no more than the limit under concurrent reservations", async () => {
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

    const results = await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        runWith(storage, reserve(`summary-${index}`))
      )
    );

    expect(
      results.filter((result) => result.status === "reserved")
    ).toHaveLength(10);
    expect(
      results.filter((result) => result.status === "limit_reached")
    ).toHaveLength(15);
  });

  it("does not double-charge the same settlement and isolates windows", async () => {
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

    const first = await runWith(storage, reserve("window-1"));
    const retry = await runWith(storage, reserve("window-1"));
    const nextMonth = await runWith(storage, reserve("window-2"));

    expect(first).toMatchObject({ count: 1, status: "reserved" });
    expect(retry).toMatchObject({ count: 1, status: "duplicate" });
    expect(nextMonth).toMatchObject({ count: 1, status: "reserved" });
  });
});
