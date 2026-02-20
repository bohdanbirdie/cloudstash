import { Effect, Logger } from "effect";

export const createLogger = (component: string) =>
  Logger.make(({ logLevel, message, annotations, date }) => {
    const allAnnotations: Record<string, unknown> = {};
    for (const [key, value] of annotations) {
      allAnnotations[key] = value;
    }

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

    const logEvent = {
      timestamp: date.toISOString(),
      service: `cloudstash-${component.toLowerCase()}`,
      level: logLevel._tag.toLowerCase(),
      message: msg,
      ...allAnnotations,
    };

    console.log(JSON.stringify(logEvent));
  });

export const runWithLogger =
  (component: string) =>
  <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> =>
    effect.pipe(
      Effect.provide(
        Logger.replace(Logger.defaultLogger, createLogger(component))
      ),
      Effect.runPromise
    );

/**
 * Sync logger for non-Effect contexts (callbacks, middlewares)
 */
export const logSync = (component: string) => {
  const logger = createLogger(component);
  const withLogger = Logger.replace(Logger.defaultLogger, logger);

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
