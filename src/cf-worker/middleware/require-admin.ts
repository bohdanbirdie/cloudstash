import { Effect, Schema } from "effect";
import { createMiddleware } from "hono/factory";

import { AppLayerLive, AuthClient } from "../auth/service";
import { logSync } from "../logger";
import type { AdminSession, Env } from "../shared";

const logger = logSync("Admin");

type MiddlewareEnv = {
  Bindings: Env;
  Variables: {
    session: AdminSession;
  };
};

class AdminUnauthorizedError extends Schema.TaggedError<AdminUnauthorizedError>()(
  "AdminUnauthorizedError",
  {}
) {}

class AdminForbiddenError extends Schema.TaggedError<AdminForbiddenError>()(
  "AdminForbiddenError",
  {}
) {}

const getSession = Effect.fn("Admin.getSession")(function* (headers: Headers) {
  const auth = yield* AuthClient;
  return yield* Effect.tryPromise({
    catch: () => new AdminUnauthorizedError(),
    try: () => auth.api.getSession({ headers }),
  }).pipe(
    Effect.flatMap((session) =>
      session
        ? Effect.succeed(session)
        : Effect.fail(new AdminUnauthorizedError())
    )
  );
});

const checkAdmin = (session: { user: { role?: string | null } }) =>
  session.user.role === "admin"
    ? Effect.succeed(session)
    : Effect.fail(new AdminForbiddenError());

export const requireAdmin = createMiddleware<MiddlewareEnv>(async (c, next) => {
  const result = await Effect.runPromise(
    getSession(c.req.raw.headers).pipe(
      Effect.flatMap(checkAdmin),
      Effect.provide(AppLayerLive(c.env)),
      Effect.match({
        onFailure: (error) => ({ error }),
        onSuccess: (session) => ({ session }),
      })
    )
  );

  if ("error" in result) {
    if (result.error._tag === "AdminUnauthorizedError") {
      logger.debug("Admin middleware - unauthorized");
      return c.json({ error: "Unauthorized" }, 401);
    }
    logger.info("Admin middleware - forbidden (not admin)");
    return c.json({ error: "Admin access required" }, 403);
  }

  c.set("session", result.session as AdminSession);
  await next();
});
