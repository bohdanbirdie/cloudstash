import { Effect, Layer, Logger } from "effect";

import { createLogger } from "../logger";
import { OtelTracingLive } from "../tracing";

export const LibraryLogger = createLogger("LibraryDO");

export const runEffect = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  effect.pipe(
    Effect.provide(Layer.merge(Logger.layer([LibraryLogger]), OtelTracingLive)),
    Effect.runPromise
  );
