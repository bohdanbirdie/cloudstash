import { Clock, Context, Effect, Layer } from "effect";

import { sideEffectError } from "../effects-helpers";

const makeXSyncAlarm = (storage: DurableObjectStorage) => {
  const scheduleAfter = Effect.fn("XSyncAlarm.scheduleAfter")(function* (
    delayMs: number
  ) {
    const now = yield* Clock.currentTimeMillis;
    yield* Effect.tryPromise({
      try: () => storage.setAlarm(now + delayMs),
      catch: sideEffectError("storage.setAlarm"),
    });
  });

  return {
    cancel: Effect.fn("XSyncAlarm.cancel")(function* () {
      yield* Effect.tryPromise({
        try: () => storage.deleteAlarm(),
        catch: sideEffectError("storage.cancelAlarm"),
      });
    }),
    ensureAfter: Effect.fn("XSyncAlarm.ensureAfter")(function* (
      delayMs: number
    ) {
      const existing = yield* Effect.tryPromise({
        try: () => storage.getAlarm(),
        catch: sideEffectError("storage.getAlarm"),
      });
      if (existing === null) {
        yield* scheduleAfter(delayMs);
      }
    }),
    scheduleAfter,
  };
};

export class XSyncAlarm extends Context.Service<
  XSyncAlarm,
  ReturnType<typeof makeXSyncAlarm>
>()("@cloudstash/x-sync/services/XSyncAlarm") {
  static layer(storage: DurableObjectStorage): Layer.Layer<XSyncAlarm> {
    return Layer.succeed(XSyncAlarm, makeXSyncAlarm(storage));
  }
}
