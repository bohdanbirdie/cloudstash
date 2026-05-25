import { Effect, Either } from "effect";
import { describe, expect, it } from "vitest";

import { OrgId } from "../../db/branded";
import { EnrichmentUsage, EnrichmentUsageLive } from "../usage";

interface PutCall {
  key: string;
  value: string;
  options?: KVNamespacePutOptions;
}

class FakeKv {
  private map = new Map<string, string>();
  readonly puts: PutCall[] = [];
  getError: Error | null = null;
  putError: Error | null = null;

  async get(key: string): Promise<string | null> {
    if (this.getError) throw this.getError;
    return this.map.get(key) ?? null;
  }

  async put(
    key: string,
    value: string,
    options?: KVNamespacePutOptions
  ): Promise<void> {
    if (this.putError) throw this.putError;
    this.puts.push({ key, value, options });
    this.map.set(key, value);
  }

  size(): number {
    return this.map.size;
  }
}

const runWithKv = <A, E>(
  kv: FakeKv,
  effect: Effect.Effect<A, E, EnrichmentUsage>
): Promise<A> =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(EnrichmentUsageLive({ kv: kv as unknown as KVNamespace }))
    )
  );

const runEitherWithKv = <A, E>(
  kv: FakeKv,
  effect: Effect.Effect<A, E, EnrichmentUsage>
) => runWithKv(kv, Effect.either(effect));

describe("EnrichmentUsage", () => {
  const orgId = OrgId.make("org-1");

  it("reports zero when the period has no key yet", async () => {
    const kv = new FakeKv();
    const result = await runWithKv(
      kv,
      EnrichmentUsage.pipe(Effect.flatMap((u) => u.current(orgId)))
    );
    expect(result.used).toBe(0);
    expect(result.period).toMatch(/^\d{4}-\d{2}$/);
  });

  it("increments monotonically and persists to KV", async () => {
    const kv = new FakeKv();
    const incEffect = EnrichmentUsage.pipe(
      Effect.flatMap((u) => u.increment(orgId))
    );

    const first = await runWithKv(kv, incEffect);
    const second = await runWithKv(kv, incEffect);
    const third = await runWithKv(kv, incEffect);

    expect(first.used).toBe(1);
    expect(second.used).toBe(2);
    expect(third.used).toBe(3);
    expect(kv.size()).toBe(1);

    const current = await runWithKv(
      kv,
      EnrichmentUsage.pipe(Effect.flatMap((u) => u.current(orgId)))
    );
    expect(current.used).toBe(3);
  });

  it("keeps counters isolated by orgId", async () => {
    const kv = new FakeKv();
    const a = OrgId.make("org-a");
    const b = OrgId.make("org-b");
    await runWithKv(
      kv,
      EnrichmentUsage.pipe(Effect.flatMap((u) => u.increment(a)))
    );
    await runWithKv(
      kv,
      EnrichmentUsage.pipe(Effect.flatMap((u) => u.increment(a)))
    );
    await runWithKv(
      kv,
      EnrichmentUsage.pipe(Effect.flatMap((u) => u.increment(b)))
    );
    const aUsed = await runWithKv(
      kv,
      EnrichmentUsage.pipe(Effect.flatMap((u) => u.current(a)))
    );
    const bUsed = await runWithKv(
      kv,
      EnrichmentUsage.pipe(Effect.flatMap((u) => u.current(b)))
    );
    expect(aUsed.used).toBe(2);
    expect(bUsed.used).toBe(1);
  });

  it("writes a TTL on every increment so counters auto-expire after the active period", async () => {
    const kv = new FakeKv();
    await runWithKv(
      kv,
      EnrichmentUsage.pipe(Effect.flatMap((u) => u.increment(orgId)))
    );
    expect(kv.puts).toHaveLength(1);
    const put = kv.puts[0];
    expect(put.options?.expirationTtl).toBeGreaterThan(0);
    expect(put.options?.expirationTtl).toBe(60 * 60 * 24 * 70);
  });

  it("treats a non-numeric stored value as zero (defensive on corruption)", async () => {
    const kv = new FakeKv();
    await kv.put("enrichment:org-1:2026-01", "garbage");
    kv.puts.length = 0;
    const got = await kv.get("enrichment:org-1:2026-01");
    expect(got).toBe("garbage");

    const result = await runWithKv(
      kv,
      EnrichmentUsage.pipe(Effect.flatMap((u) => u.current(orgId)))
    );
    expect(result.used).toBe(0);
  });

  it("surfaces KV.get failures as EnrichmentUsageGetError", async () => {
    const kv = new FakeKv();
    kv.getError = new Error("KV down");
    const result = await runEitherWithKv(
      kv,
      EnrichmentUsage.pipe(Effect.flatMap((u) => u.current(orgId)))
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("EnrichmentUsageGetError");
      expect(result.left).toMatchObject({ storeId: orgId });
    }
  });

  it("surfaces KV.put failures as EnrichmentUsagePutError", async () => {
    const kv = new FakeKv();
    kv.putError = new Error("KV down");
    const result = await runEitherWithKv(
      kv,
      EnrichmentUsage.pipe(Effect.flatMap((u) => u.increment(orgId)))
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("EnrichmentUsagePutError");
      expect(result.left).toMatchObject({ storeId: orgId });
    }
  });
});
