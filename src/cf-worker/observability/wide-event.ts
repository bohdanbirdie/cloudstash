import { AsyncLocalStorage } from "node:async_hooks";

import type { CfTypes } from "@livestore/sync-cf/cf-worker";
import { Effect } from "effect";
import { createLogger } from "evlog";
import type { FieldContext, RedactConfig, RequestLogger } from "evlog";
import { initWorkersLogger, withEvlog } from "evlog/workers";
import type { Context } from "hono";
import { routePath } from "hono/route";

import type { Env } from "../shared";

type EventTrigger =
  | "http"
  | "queue"
  | "scheduled"
  | "durable_object"
  | "workflow";

type EventOutcome =
  | "success"
  | "rejected"
  | "rate_limited"
  | "not_found"
  | "error";

export interface CloudstashWideEventFields {
  path?: string;
  requestId?: string;
  event: {
    name: string;
    trigger: EventTrigger;
    outcome?: EventOutcome;
  };
  component?: string;
  http?: {
    route?: string;
  };
  auth?: {
    method?: "session" | "api_key" | "oauth" | "telegram";
    outcome?: "success" | "missing" | "invalid" | "denied" | "unavailable";
    reasonCode?: string;
  };
  ingest?: {
    source?: string;
    requested?: number;
    accepted?: number;
    duplicates?: number;
    failed?: number;
  };
  metadata?: {
    outcome?: string;
    extractor?: string;
    extractorAuthoritative?: boolean;
    hasDescription?: boolean;
    hasImage?: boolean;
    hasTitle?: boolean;
  };
  rateLimit?: {
    scope: "edge" | "metadata";
    outcome: "passed" | "limited" | "unavailable";
  };
  sync?: {
    outcome?: string;
    eventCount?: number;
    eventTypes?: string[];
  };
  queue?: {
    name: string;
    batchSize: number;
  };
  work?: {
    attempted?: number;
    succeeded?: number;
    failed?: number;
    skipped?: number;
  };
  error?: {
    type: string;
    code?: string;
  };
}

type WideEventFields = FieldContext<CloudstashWideEventFields>;
type WideEventLogger = RequestLogger<CloudstashWideEventFields>;

const REDACTION: RedactConfig = {
  paths: [
    "authorization",
    "cookie",
    "set-cookie",
    "password",
    "secret",
    "token",
    "*_token",
    "*Token",
    "url",
    "targetUrl",
    "ip",
    "userAgent",
    "user.email",
    "error.message",
    "error.stack",
    "error.cause",
    "requestHeaders",
  ],
};

initWorkersLogger({
  env: { service: "cloudstash-worker" },
  redact: REDACTION,
});

const storage = new AsyncLocalStorage<WideEventLogger>();

const requestOutcome = (status: number): EventOutcome => {
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "error";
  if (status >= 400) return "rejected";
  return "success";
};

const safeRequestPath = (pathname: string): string => {
  if (pathname === "/" || pathname === "/sync" || pathname === "/mcp") {
    return pathname;
  }
  if (pathname.startsWith("/.well-known/")) return "/.well-known/*";
  if (pathname.startsWith("/api/")) return "/api/*";
  if (pathname.startsWith("/agents/")) return "/agents/*";
  return "/assets/*";
};

const safeError = (error: unknown): CloudstashWideEventFields["error"] => ({
  type: error instanceof Error ? error.name || "Error" : typeof error,
});

export const addWideEvent = (fields: WideEventFields): void => {
  storage.getStore()?.set(fields);
};

export const annotateWideEvent = (
  fields: WideEventFields
): Effect.Effect<void> => Effect.sync(() => addWideEvent(fields));

export const annotateHonoRoute = async (
  c: Context,
  next: () => Promise<void>
): Promise<void> => {
  try {
    await next();
  } finally {
    const route = routePath(c, -1) || "/api/*";
    addWideEvent({
      event: { name: "http.request", trigger: "http" },
      http: { route },
      path: route,
    });
  }
};

type FetchHandler = (
  request: Request,
  env: Env,
  ctx: CfTypes.ExecutionContext
) => Promise<Response>;

export const observeFetch = (handler: FetchHandler): FetchHandler => {
  const observed = withEvlog<Env>(
    async (request, env, ctx, logger) =>
      storage.run(logger as WideEventLogger, async () => {
        const route = safeRequestPath(new URL(request.url).pathname);
        logger.set({
          event: { name: "http.request", trigger: "http" },
          http: { route },
          path: route,
          requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
        });

        try {
          const response = await handler(
            request,
            env,
            ctx as CfTypes.ExecutionContext
          );
          logger.set({
            event: {
              name: "http.request",
              trigger: "http",
              outcome: requestOutcome(response.status),
            },
          });
          return response;
        } catch (error) {
          logger.setLevel("error");
          logger.set({
            event: {
              name: "http.request",
              trigger: "http",
              outcome: "error",
            },
            error: safeError(error),
          });
          throw error;
        }
      }),
    { redact: REDACTION }
  );

  return (request, env, ctx) => {
    const executionContext =
      typeof ctx?.waitUntil === "function"
        ? ctx
        : ({ ...ctx, waitUntil: () => undefined } as CfTypes.ExecutionContext);
    return observed.fetch(request, env, executionContext);
  };
};

export interface OperationEvent extends Omit<
  CloudstashWideEventFields,
  "event"
> {
  event: {
    name: string;
    trigger: Exclude<EventTrigger, "http">;
  };
}

export const observeOperation = async <A>(
  initial: OperationEvent,
  operation: () => Promise<A>
): Promise<A> => {
  const logger = createLogger<CloudstashWideEventFields>({ ...initial });

  return storage.run(logger, async () => {
    try {
      const result = await operation();
      logger.set({
        event: { ...initial.event, outcome: "success" },
      });
      return result;
    } catch (error) {
      logger.setLevel("error");
      logger.set({
        event: { ...initial.event, outcome: "error" },
        error: safeError(error),
      });
      throw error;
    } finally {
      logger.emit();
    }
  });
};
