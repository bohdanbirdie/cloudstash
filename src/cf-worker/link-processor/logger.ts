import { Effect, Layer, Logger } from "effect";

import { createLogger } from "../logger";
import type { Env } from "../shared";
import { OtelTracingLive } from "../tracing";

export const LinkProcessorLogger = createLogger("LinkProcessorDO");

export const runEffect = <A, E>(
  effect: Effect.Effect<A, E>,
  env: Env
): Promise<A> =>
  effect.pipe(
    Effect.provide(
      Layer.merge(
        Logger.replace(Logger.defaultLogger, LinkProcessorLogger),
        OtelTracingLive(env)
      )
    ),
    Effect.runPromise
  );
