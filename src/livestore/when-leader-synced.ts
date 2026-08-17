import {
  EventSequenceNumber,
  StoreInternalsSymbol,
} from "@livestore/livestore";
import type { StoreInternals } from "@livestore/livestore";
import { Effect, Stream } from "effect";

type StoreWithInternals = {
  readonly [StoreInternalsSymbol]: StoreInternals;
};

type SyncStateSource = StoreInternals["syncProcessor"]["syncState"];
export type SyncTarget = EventSequenceNumber.Client.Composite;

// The session state stream is backed by a queue, so concurrent consumers would
// divide its updates and could miss each other's final drain signal. Keep one
// barrier consumer per Store while still allowing different stores to proceed
// independently.
type BarrierRunner = (effect: Effect.Effect<boolean>) => Promise<boolean>;

export const makeSerializedBarrierQueue = <Key extends object>() => {
  const tails = new WeakMap<Key, Promise<void>>();

  const enqueue = (
    key: Key,
    barrier: Effect.Effect<void>,
    timeoutMs: number,
    run: BarrierRunner
  ): Promise<boolean> => {
    const previous = tails.get(key) ?? Promise.resolve();
    const result = Effect.promise(() => previous).pipe(
      Effect.andThen(barrier),
      Effect.timeout(timeoutMs),
      Effect.as(true),
      Effect.catchTag("TimeoutError", () => Effect.succeed(false)),
      run
    );
    const tail = result.then(
      () => undefined,
      () => undefined
    );
    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) {
        tails.delete(key);
      }
    });
    return result;
  };

  return { enqueue };
};

const barrierQueue = makeSerializedBarrierQueue<StoreWithInternals>();

const waitForTargetHandoff = (syncState: SyncStateSource, target: SyncTarget) =>
  Stream.concat(Stream.fromEffect(syncState), syncState.changes).pipe(
    Stream.filter(
      (state) =>
        state.pending.length === 0 &&
        EventSequenceNumber.Client.isGreaterThanOrEqual(state.localHead, target)
    ),
    Stream.runHead,
    Effect.asVoid
  );

const waitForTargetDurability = (
  syncState: SyncStateSource,
  target: SyncTarget
) =>
  Stream.concat(Stream.fromEffect(syncState), syncState.changes).pipe(
    Stream.filter(
      (state) =>
        state.pending.length === 0 &&
        EventSequenceNumber.Client.isGreaterThanOrEqual(
          state.upstreamHead,
          target
        )
    ),
    Stream.runHead,
    Effect.asVoid
  );

/**
 * Wait until locally committed events have reached the sync backend.
 *
 * The order is essential: a commit enters the session queue synchronously,
 * while its hand-off to the leader is asynchronous. Waiting on an initially
 * empty leader queue first would therefore report a false success.
 *
 * This small adapter intentionally contains the one dependency on LiveStore's
 * internal leader sync state until LiveStore exposes commit receipts publicly.
 */
const makeLeaderBarrier = (
  store: StoreWithInternals,
  target: SyncTarget
): Effect.Effect<void> => {
  const internals = store[StoreInternalsSymbol];
  const sessionSyncState = internals.syncProcessor.syncState;
  const leaderSyncState = internals.clientSession.leaderThread.syncState;

  return Effect.gen(function* () {
    yield* waitForTargetHandoff(sessionSyncState, target);
    const leaderTarget = (yield* leaderSyncState).localHead;
    yield* waitForTargetDurability(leaderSyncState, leaderTarget);
  });
};

export const captureSyncTarget = (store: StoreWithInternals): SyncTarget => {
  const internals = store[StoreInternalsSymbol];
  return internals.syncProcessor.syncState.pipe(
    Effect.map((state) => state.localHead),
    Effect.runSyncWith(internals.effectContext.services)
  );
};

export const whenLeaderSynced = (
  store: StoreWithInternals,
  options: { target: SyncTarget; timeoutMs: number }
): Promise<boolean> => {
  const internals = store[StoreInternalsSymbol];
  return barrierQueue.enqueue(
    store,
    makeLeaderBarrier(store, options.target),
    options.timeoutMs,
    (effect) =>
      effect.pipe(Effect.runPromiseWith(internals.effectContext.services))
  );
};
