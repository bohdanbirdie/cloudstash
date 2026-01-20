import { Effect, Logger, LogLevel } from 'effect'

/**
 * Custom logger for LinkProcessorDO that formats logs with component prefix
 */
export const LinkProcessorLogger = Logger.make(({ logLevel, message, annotations, date }) => {
  const level = logLevel._tag

  // Collect all annotations from the annotation map
  const allAnnotations: Record<string, unknown> = {}
  for (const [key, value] of annotations) {
    allAnnotations[key] = value
  }

  const annotationsStr =
    Object.keys(allAnnotations).length > 0 ? ` ${JSON.stringify(allAnnotations)}` : ''

  // Handle different message types - Effect passes messages as arrays or other types
  let msg: string
  if (typeof message === 'string') {
    msg = message
  } else if (Array.isArray(message)) {
    msg = message.map((m) => (typeof m === 'string' ? m : JSON.stringify(m))).join(' ')
  } else {
    msg = JSON.stringify(message)
  }

  const output = `[${date.toISOString()}] [LinkProcessorDO] [${level}] ${msg}${annotationsStr}`

  if (logLevel === LogLevel.Error) console.error(output)
  else if (logLevel === LogLevel.Warning) console.warn(output)
  else console.log(output)
})

/**
 * Run an Effect with the LinkProcessor logger
 */
export const runEffect = <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> =>
  effect.pipe(
    Effect.provide(Logger.replace(Logger.defaultLogger, LinkProcessorLogger)),
    Effect.runPromise,
  )
