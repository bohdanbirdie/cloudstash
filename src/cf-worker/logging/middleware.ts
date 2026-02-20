import { createMiddleware } from "hono/factory";

import { type Env, type HonoVariables } from "../shared";
import { createRequestContext } from "./context";
import { emitWideEvent } from "./logger";
import { type RequestContextData, type WideEvent } from "./types";

export interface LoggingVariables {
  requestContext: RequestContextData;
  requestId: string;
}

const SERVICE_NAME = "cloudstash-worker";

export const wideEventMiddleware = createMiddleware<{
  Bindings: Env & {
    VERSION?: string;
    COMMIT_HASH?: string;
  };
  Variables: HonoVariables & LoggingVariables;
}>(async (c, next) => {
  const requestContext = createRequestContext();
  c.set("requestContext", requestContext);
  c.set("requestId", requestContext.requestId);

  const url = new URL(c.req.url);

  const baseEvent: Partial<WideEvent> = {
    timestamp: new Date().toISOString(),
    requestId: requestContext.requestId,
    service: SERVICE_NAME,
    version: c.env.VERSION ?? "dev",
    commitHash: c.env.COMMIT_HASH ?? "unknown",
    region: (c.req.raw.cf?.colo as string) ?? "unknown",
    method: c.req.method,
    path: url.pathname,
    userAgent: c.req.header("user-agent"),
    ip: c.req.header("cf-connecting-ip"),
  };

  try {
    await next();

    const wideEvent: WideEvent = {
      ...baseEvent,
      ...requestContext.getFields(),
      statusCode: c.res.status,
      durationMs: Date.now() - requestContext.startTime,
      outcome: c.res.status < 400 ? "success" : "error",
    } as WideEvent;

    emitWideEvent(wideEvent);
  } catch (error) {
    const wideEvent: WideEvent = {
      ...baseEvent,
      ...requestContext.getFields(),
      statusCode: 500,
      durationMs: Date.now() - requestContext.startTime,
      outcome: "error",
      error:
        error instanceof Error
          ? { type: error.name, message: error.message }
          : { type: "Unknown", message: String(error) },
    } as WideEvent;

    emitWideEvent(wideEvent);
    throw error;
  }
});

export const addToWideEvent = (
  c: { get: (key: "requestContext") => RequestContextData | undefined },
  fields: Record<string, unknown>
): void => {
  const ctx = c.get("requestContext");
  if (ctx) {
    ctx.addFields(fields);
  }
};
