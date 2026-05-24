import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Ref } from "effect";

import { capabilitiesFor } from "@/lib/plan";
import type { TierCapabilities } from "@/lib/plan";

import { OrgId } from "../../db/branded";
import type { WeeklyDigestRpcResult } from "../rpc";
import type { WeeklyDigestTrigger } from "../runner";
import { DigestScheduler, DigestSchedulerLive } from "../scheduler";
import type { DigestSchedulerDeps } from "../scheduler";

interface FakeStorageState {
  alarm: number | null;
  kv: Map<string, unknown>;
}

const makeFakeStorage = (
  initial?: Partial<FakeStorageState>
): DurableObjectStorage => {
  const state: FakeStorageState = {
    alarm: initial?.alarm ?? null,
    kv: initial?.kv ?? new Map(),
  };
  const storage = {
    deleteAlarm: async () => {
      state.alarm = null;
    },
    get: async <T>(key: string): Promise<T | undefined> =>
      state.kv.get(key) as T | undefined,
    getAlarm: async () => state.alarm,
    put: async (key: string, value: unknown) => {
      state.kv.set(key, value);
    },
    setAlarm: async (at: number) => {
      state.alarm = at;
    },
  };
  return Object.assign(storage as object, {
    __state: state,
  }) as unknown as DurableObjectStorage;
};

const storageState = (s: DurableObjectStorage): FakeStorageState =>
  (s as unknown as { __state: FakeStorageState }).__state;

interface DepsOverrides {
  readonly storage?: DurableObjectStorage;
  readonly storeIdRef?: Ref.Ref<Option.Option<OrgId>>;
  readonly capabilities?: TierCapabilities;
  readonly tombstoned?: boolean;
  readonly runDigestResult?: WeeklyDigestRpcResult;
  readonly runDigestFail?: boolean;
  readonly runDigestCalls?: Ref.Ref<
    Array<{ storeId: OrgId; trigger: WeeklyDigestTrigger }>
  >;
}

const makeDeps = (
  overrides: DepsOverrides = {}
): {
  deps: DigestSchedulerDeps;
  storage: DurableObjectStorage;
  storeIdRef: Ref.Ref<Option.Option<OrgId>>;
  runDigestCalls: Ref.Ref<
    Array<{ storeId: OrgId; trigger: WeeklyDigestTrigger }>
  >;
} => {
  const storage = overrides.storage ?? makeFakeStorage();
  const storeIdRef =
    overrides.storeIdRef ??
    Effect.runSync(Ref.make<Option.Option<OrgId>>(Option.none()));
  const runDigestCalls =
    overrides.runDigestCalls ??
    Effect.runSync(
      Ref.make<Array<{ storeId: OrgId; trigger: WeeklyDigestTrigger }>>([])
    );
  const deps: DigestSchedulerDeps = {
    storage,
    getStoreId: Ref.get(storeIdRef),
    setStoreId: (id) => Ref.set(storeIdRef, Option.some(id)),
    getCapabilities: Effect.succeed(
      overrides.capabilities ?? capabilitiesFor("plus")
    ),
    isDeletionTombstoned: Effect.succeed(overrides.tombstoned ?? false),
    runDigest: (storeId, trigger) =>
      Effect.gen(function* () {
        yield* Ref.update(runDigestCalls, (xs) => [
          ...xs,
          { storeId, trigger },
        ]);
        if (overrides.runDigestFail) {
          return yield* Effect.die(new Error("digest blew up"));
        }
        return (
          overrides.runDigestResult ?? {
            linkCount: 1,
            period: "2026-W21",
            status: "generated",
          }
        );
      }),
  };
  return { deps, runDigestCalls, storage, storeIdRef };
};

const withScheduler = <A>(
  deps: DigestSchedulerDeps,
  f: (s: DigestScheduler["Type"]) => Effect.Effect<A>
): Effect.Effect<A> =>
  Effect.gen(function* () {
    const scheduler = yield* DigestScheduler;
    return yield* f(scheduler);
  }).pipe(Effect.provide(DigestSchedulerLive(deps)));

const ORG_A = OrgId.make("org-a");

describe("DigestScheduler.ensureScheduled", () => {
  it.effect("does nothing when storeId is not set", () =>
    Effect.gen(function* () {
      const { deps, storage } = makeDeps();
      yield* withScheduler(deps, (s) => s.ensureScheduled);
      expect(storageState(storage).alarm).toBeNull();
    })
  );

  it.effect("does nothing when capability is off (free tier)", () =>
    Effect.gen(function* () {
      const storeIdRef = yield* Ref.make<Option.Option<OrgId>>(
        Option.some(ORG_A)
      );
      const { deps, storage } = makeDeps({
        capabilities: capabilitiesFor("free"),
        storeIdRef,
      });
      yield* withScheduler(deps, (s) => s.ensureScheduled);
      expect(storageState(storage).alarm).toBeNull();
    })
  );

  it.effect("does not overwrite an existing alarm", () =>
    Effect.gen(function* () {
      const storeIdRef = yield* Ref.make<Option.Option<OrgId>>(
        Option.some(ORG_A)
      );
      const storage = makeFakeStorage({ alarm: 12345 });
      const { deps } = makeDeps({ storage, storeIdRef });
      yield* withScheduler(deps, (s) => s.ensureScheduled);
      expect(storageState(storage).alarm).toBe(12345);
    })
  );

  it.effect("sets a future alarm when none exists and capability is on", () =>
    Effect.gen(function* () {
      const storeIdRef = yield* Ref.make<Option.Option<OrgId>>(
        Option.some(ORG_A)
      );
      const before = Date.now();
      const { deps, storage } = makeDeps({ storeIdRef });
      yield* withScheduler(deps, (s) => s.ensureScheduled);
      const alarm = storageState(storage).alarm;
      expect(alarm).not.toBeNull();
      expect(alarm!).toBeGreaterThanOrEqual(before);
    })
  );
});

describe("DigestScheduler.handleAlarm", () => {
  it.effect("exits early when no in-memory storeId and none in storage", () =>
    Effect.gen(function* () {
      const { deps, runDigestCalls, storage } = makeDeps();
      yield* withScheduler(deps, (s) => s.handleAlarm);
      expect(yield* Ref.get(runDigestCalls)).toHaveLength(0);
      expect(storageState(storage).alarm).toBeNull();
    })
  );

  it.effect("rehydrates storeId from storage when not set in memory", () =>
    Effect.gen(function* () {
      const storage = makeFakeStorage({ kv: new Map([["storeId", "org-x"]]) });
      const { deps, runDigestCalls, storeIdRef } = makeDeps({ storage });
      yield* withScheduler(deps, (s) => s.handleAlarm);
      expect(yield* Ref.get(storeIdRef)).toEqual(
        Option.some(OrgId.make("org-x"))
      );
      expect(yield* Ref.get(runDigestCalls)).toHaveLength(1);
    })
  );

  it.effect("skips run when tombstoned, no alarm re-armed", () =>
    Effect.gen(function* () {
      const storeIdRef = yield* Ref.make<Option.Option<OrgId>>(
        Option.some(ORG_A)
      );
      const { deps, runDigestCalls, storage } = makeDeps({
        storeIdRef,
        tombstoned: true,
      });
      yield* withScheduler(deps, (s) => s.handleAlarm);
      expect(yield* Ref.get(runDigestCalls)).toHaveLength(0);
      expect(storageState(storage).alarm).toBeNull();
    })
  );

  it.effect("skips run when capability is off", () =>
    Effect.gen(function* () {
      const storeIdRef = yield* Ref.make<Option.Option<OrgId>>(
        Option.some(ORG_A)
      );
      const { deps, runDigestCalls } = makeDeps({
        capabilities: capabilitiesFor("free"),
        storeIdRef,
      });
      yield* withScheduler(deps, (s) => s.handleAlarm);
      expect(yield* Ref.get(runDigestCalls)).toHaveLength(0);
    })
  );

  it.effect("runs digest and re-arms the alarm on success", () =>
    Effect.gen(function* () {
      const storeIdRef = yield* Ref.make<Option.Option<OrgId>>(
        Option.some(ORG_A)
      );
      const before = Date.now();
      const { deps, runDigestCalls, storage } = makeDeps({ storeIdRef });
      yield* withScheduler(deps, (s) => s.handleAlarm);
      const calls = yield* Ref.get(runDigestCalls);
      expect(calls).toHaveLength(1);
      expect(calls[0].trigger).toBe("alarm");
      expect(storageState(storage).alarm!).toBeGreaterThanOrEqual(before);
    })
  );

  it.effect(
    "re-arms the alarm even when digest defects (Effect.ensuring)",
    () =>
      Effect.gen(function* () {
        const storeIdRef = yield* Ref.make<Option.Option<OrgId>>(
          Option.some(ORG_A)
        );
        const before = Date.now();
        const { deps, storage } = makeDeps({
          runDigestFail: true,
          storeIdRef,
        });
        yield* withScheduler(deps, (s) => s.handleAlarm).pipe(
          Effect.catchAllDefect(() => Effect.void)
        );
        expect(storageState(storage).alarm!).toBeGreaterThanOrEqual(before);
      })
  );
});

describe("DigestScheduler.triggerDigest", () => {
  it.effect(
    "returns dropped-deletion when tombstoned, runDigest never called",
    () =>
      Effect.gen(function* () {
        const { deps, runDigestCalls } = makeDeps({ tombstoned: true });
        const result = yield* withScheduler(deps, (s) =>
          s.triggerDigest(ORG_A)
        );
        expect(result.status).toBe("dropped-deletion");
        expect(yield* Ref.get(runDigestCalls)).toHaveLength(0);
      })
  );

  it.effect("persists storeId before running", () =>
    Effect.gen(function* () {
      const { deps, runDigestCalls, storage, storeIdRef } = makeDeps();
      yield* withScheduler(deps, (s) => s.triggerDigest(ORG_A));
      expect(yield* Ref.get(storeIdRef)).toEqual(Option.some(ORG_A));
      expect(storageState(storage).kv.get("storeId")).toBe(ORG_A);
      const calls = yield* Ref.get(runDigestCalls);
      expect(calls).toHaveLength(1);
      expect(calls[0].storeId).toBe(ORG_A);
      expect(calls[0].trigger).toBe("manual");
    })
  );

  it.effect("returns the runDigest result on success", () =>
    Effect.gen(function* () {
      const expected = {
        linkCount: 7,
        period: "2026-W21",
        status: "generated",
      } as const;
      const { deps } = makeDeps({ runDigestResult: expected });
      const result = yield* withScheduler(deps, (s) => s.triggerDigest(ORG_A));
      expect(result).toEqual(expected);
    })
  );
});
