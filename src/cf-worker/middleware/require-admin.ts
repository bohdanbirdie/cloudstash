import { Effect } from "effect";
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

class UnauthorizedError {
  readonly _tag = "UnauthorizedError";
}

class ForbiddenError {
  readonly _tag = "ForbiddenError";
}

const getSession = (headers: Headers) =>
  Effect.gen(function* () {
    const auth = yield* AuthClient;
    return yield* Effect.tryPromise({
      catch: () => new UnauthorizedError(),
      try: () => auth.api.getSession({ headers }),
    }).pipe(
      Effect.flatMap((session) =>
        session ? Effect.succeed(session) : Effect.fail(new UnauthorizedError())
      )
    );
  });

const checkAdmin = (session: { user: { role?: string | null } }) =>
  session.user.role === "admin"
    ? Effect.succeed(session)
    : Effect.fail(new ForbiddenError());

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
    if (result.error._tag === "UnauthorizedError") {
      logger.debug("Admin middleware - unauthorized");
      return c.json({ error: "Unauthorized" }, 401);
    }
    logger.info("Admin middleware - forbidden (not admin)");
    return c.json({ error: "Admin access required" }, 403);
  }

  c.set("session", result.session as AdminSession);
  await next();
});
