import { Effect, Layer, Logger, LogLevel } from "effect";

import { RequestContext } from "./context";
import { type RequestContextData } from "./types";

const SERVICE_NAME = "cloudstash-worker";

export const createWideEventLogger = (requestContext: RequestContextData) =>
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

    if (logLevel >= LogLevel.Warning) {
      console.log(
        JSON.stringify({
          timestamp: date.toISOString(),
          requestId: requestContext.requestId,
          service: SERVICE_NAME,
          level: logLevel._tag.toLowerCase(),
          message: msg,
          ...allAnnotations,
        })
      );
    }

    requestContext.addFields(allAnnotations);
    if (logLevel >= LogLevel.Info && msg) {
      const eventKey = `log_${Date.now()}`;
      requestContext.addField(eventKey, {
        level: logLevel._tag.toLowerCase(),
        message: msg,
      });
    }
  });

export const runWithWideEventLogger =
  (requestContext: RequestContextData) =>
  <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> =>
    effect.pipe(
      Effect.provide(
        Layer.mergeAll(
          Logger.replace(
            Logger.defaultLogger,
            createWideEventLogger(requestContext)
          ),
          Layer.succeed(RequestContext, requestContext)
        )
      ),
      Effect.runPromise
    );

export const provideRequestContext = (requestContext: RequestContextData) =>
  Layer.mergeAll(
    Logger.replace(Logger.defaultLogger, createWideEventLogger(requestContext)),
    Layer.succeed(RequestContext, requestContext)
  );
