import { XSyncSideEffectError } from "./errors";

/**
 * Curried helper for `Effect.tryPromise({ catch: sideEffectError("op") })`.
 * Keeps the typed failure surface as `XSyncSideEffectError` everywhere we
 * bridge a CF infra Promise into Effect (queue.send, storage.setAlarm, RPC
 * stub calls). Lives in its own module to avoid circular imports between
 * `effects.ts` and the `services/*.live.ts` files.
 */
export const sideEffectError =
  (op: string) =>
  (cause: unknown): XSyncSideEffectError =>
    new XSyncSideEffectError({ op, cause });
