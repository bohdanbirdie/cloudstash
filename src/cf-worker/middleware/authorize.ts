import { Effect, Schema } from "effect";
import { createMiddleware } from "hono/factory";

import type { Permission } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";

import { AuthClient } from "../auth/service";
import { logSync } from "../logger";
import { getAppLayer } from "../runtime";
import type { AdminSession, Env } from "../shared";

const logger = logSync("Authz");

type MiddlewareEnv = {
  Bindings: Env;
  Variables: {
    session: AdminSession;
  };
};

class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  "UnauthorizedError",
  {}
) {}

class ForbiddenError extends Schema.TaggedError<ForbiddenError>()(
  "ForbiddenError",
  {}
) {}

const getSession = Effect.fn("Authz.getSession")(function* (headers: Headers) {
  const auth = yield* AuthClient;
  return yield* Effect.tryPromise({
    catch: () => new UnauthorizedError(),
    try: () => auth.api.getSession({ headers }),
  }).pipe(
    Effect.filterOrFail(
      (session): session is NonNullable<typeof session> => session !== null,
      () => new UnauthorizedError()
    )
  );
});

export const requirePermission = (permission: Permission) =>
  createMiddleware<MiddlewareEnv>(async (c, next) => {
    const result = await Effect.runPromise(
      getSession(c.req.raw.headers).pipe(
        Effect.flatMap((session) =>
          hasPermission(session.user.role, permission)
            ? Effect.succeed(session)
            : Effect.fail(new ForbiddenError())
        ),
        Effect.provide(getAppLayer(c.env)),
        Effect.match({
          onFailure: (error) => ({ error }),
          onSuccess: (session) => ({ session }),
        })
      )
    );

    if ("error" in result) {
      if (result.error._tag === "UnauthorizedError") {
        logger.debug("Authz - unauthorized");
        return c.json({ error: "Unauthorized" }, 401);
      }
      logger.info("Authz - forbidden (insufficient permission)");
      return c.json({ error: "Admin access required" }, 403);
    }

    c.set("session", result.session as AdminSession);
    await next();
  });
