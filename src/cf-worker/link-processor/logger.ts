import { Effect, Layer, Logger } from "effect";

import { createLogger } from "../logger";
import { OtelTracingLive } from "../tracing";

export const LinkProcessorLogger = createLogger("LinkProcessorDO");

export const runEffect = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  effect.pipe(
    Effect.provide(
      Layer.merge(
        Logger.replace(Logger.defaultLogger, LinkProcessorLogger),
        OtelTracingLive
      )
    ),
    Effect.runPromise
  );
