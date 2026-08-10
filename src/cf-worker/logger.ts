import { Effect, Logger, References } from "effect";

export const createLogger = (component: string) =>
  Logger.make(({ logLevel, message, fiber, date }) => {
    const annotations = fiber.getRef(References.CurrentLogAnnotations);

    const annotationsStr =
      Object.keys(annotations).length > 0
        ? ` ${JSON.stringify(annotations)}`
        : "";

    let msg: string;
    if (typeof message === "string") {
      msg = message;
    } else if (Array.isArray(message)) {
      msg = message
        .map((m) => (typeof m === "string" ? m : JSON.stringify(m)))
        .join(" ");
    } else {
      msg = JSON.stringify(message);
    }

    const output = `[${date.toISOString()}] [${component}] [${logLevel}] ${msg}${annotationsStr}`;

    if (logLevel === "Error") {
      console.error(output);
    } else if (logLevel === "Warn") {
      console.warn(output);
    } else {
      console.log(output);
    }
  });

export const runWithLogger =
  (component: string) =>
  <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
    effect.pipe(
      Effect.provide(Logger.layer([createLogger(component)])),
      Effect.runPromise
    );

/**
 * Sync logger for non-Effect contexts (callbacks, middlewares)
 */
export const logSync = (component: string) => {
  const withLogger = Logger.layer([createLogger(component)]);

  return {
    debug: (message: string, annotations?: Record<string, unknown>) =>
      Effect.runSync(
        Effect.logDebug(message).pipe(
          annotations ? Effect.annotateLogs(annotations) : (x) => x,
          Effect.provide(withLogger)
        )
      ),
    error: (message: string, annotations?: Record<string, unknown>) =>
      Effect.runSync(
        Effect.logError(message).pipe(
          annotations ? Effect.annotateLogs(annotations) : (x) => x,
          Effect.provide(withLogger)
        )
      ),
    info: (message: string, annotations?: Record<string, unknown>) =>
      Effect.runSync(
        Effect.logInfo(message).pipe(
          annotations ? Effect.annotateLogs(annotations) : (x) => x,
          Effect.provide(withLogger)
        )
      ),
    warn: (message: string, annotations?: Record<string, unknown>) =>
      Effect.runSync(
        Effect.logWarning(message).pipe(
          annotations ? Effect.annotateLogs(annotations) : (x) => x,
          Effect.provide(withLogger)
        )
      ),
  };
};
