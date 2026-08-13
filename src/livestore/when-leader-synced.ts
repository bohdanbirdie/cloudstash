import { StoreInternalsSymbol } from "@livestore/livestore";
import type { StoreInternals } from "@livestore/livestore";
import { Effect, Stream } from "effect";

type StoreWithInternals = {
  readonly [StoreInternalsSymbol]: StoreInternals;
};

type SyncStateSource = StoreInternals["syncProcessor"]["syncState"];

// The session state stream is backed by a queue, so concurrent consumers would
// divide its updates and could miss each other's final drain signal. Keep one
// barrier consumer per Store while still allowing different stores to proceed
// independently.
const barrierTails = new WeakMap<StoreWithInternals, Promise<void>>();

const waitForPendingToDrain = (syncState: SyncStateSource) =>
  Stream.concat(Stream.fromEffect(syncState), syncState.changes).pipe(
    Stream.filter((state) => state.pending.length === 0),
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
const runLeaderBarrier = (
  store: StoreWithInternals,
  { timeoutMs }: { timeoutMs: number }
): Promise<boolean> => {
  const internals = store[StoreInternalsSymbol];

  return Effect.gen(function* () {
    yield* waitForPendingToDrain(internals.syncProcessor.syncState);
    yield* waitForPendingToDrain(
      internals.clientSession.leaderThread.syncState
    );
  }).pipe(
    Effect.timeout(timeoutMs),
    Effect.as(true),
    Effect.catchTag("TimeoutError", () => Effect.succeed(false)),
    Effect.runPromiseWith(internals.effectContext.services)
  );
};

export const whenLeaderSynced = (
  store: StoreWithInternals,
  options: { timeoutMs: number }
): Promise<boolean> => {
  const previous = barrierTails.get(store) ?? Promise.resolve();
  const result = previous.then(
    () => runLeaderBarrier(store, options),
    () => runLeaderBarrier(store, options)
  );
  const tail = result.then(
    () => undefined,
    () => undefined
  );
  barrierTails.set(store, tail);
  void tail.then(() => {
    if (barrierTails.get(store) === tail) {
      barrierTails.delete(store);
    }
  });
  return result;
};
