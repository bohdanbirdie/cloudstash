import { Effect, Logger, LogLevel } from 'effect'

export const createLogger = (component: string) =>
  Logger.make(({ logLevel, message, annotations, date }) => {
    const level = logLevel._tag

    const allAnnotations: Record<string, unknown> = {}
    for (const [key, value] of annotations) {
      allAnnotations[key] = value
    }

    const annotationsStr =
      Object.keys(allAnnotations).length > 0 ? ` ${JSON.stringify(allAnnotations)}` : ''

    let msg: string
    if (typeof message === 'string') {
      msg = message
    } else if (Array.isArray(message)) {
      msg = message.map((m) => (typeof m === 'string' ? m : JSON.stringify(m))).join(' ')
    } else {
      msg = JSON.stringify(message)
    }

    const output = `[${date.toISOString()}] [${component}] [${level}] ${msg}${annotationsStr}`

    if (logLevel === LogLevel.Error) console.error(output)
    else if (logLevel === LogLevel.Warning) console.warn(output)
    else console.log(output)
  })

export const runWithLogger =
  (component: string) =>
  <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> =>
    effect.pipe(
      Effect.provide(Logger.replace(Logger.defaultLogger, createLogger(component))),
      Effect.runPromise,
    )

/**
 * Sync logger for non-Effect contexts (callbacks, middlewares)
 */
export const logSync = (component: string) => {
  const logger = createLogger(component)
  const withLogger = Logger.replace(Logger.defaultLogger, logger)

  return {
    info: (message: string, annotations?: Record<string, unknown>) =>
      Effect.runSync(
        Effect.logInfo(message).pipe(
          annotations ? Effect.annotateLogs(annotations) : (x) => x,
          Effect.provide(withLogger),
        ),
      ),
    error: (message: string, annotations?: Record<string, unknown>) =>
      Effect.runSync(
        Effect.logError(message).pipe(
          annotations ? Effect.annotateLogs(annotations) : (x) => x,
          Effect.provide(withLogger),
        ),
      ),
    warn: (message: string, annotations?: Record<string, unknown>) =>
      Effect.runSync(
        Effect.logWarning(message).pipe(
          annotations ? Effect.annotateLogs(annotations) : (x) => x,
          Effect.provide(withLogger),
        ),
      ),
    debug: (message: string, annotations?: Record<string, unknown>) =>
      Effect.runSync(
        Effect.logDebug(message).pipe(
          annotations ? Effect.annotateLogs(annotations) : (x) => x,
          Effect.provide(withLogger),
        ),
      ),
  }
}
