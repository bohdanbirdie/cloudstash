import { Effect } from "effect";
import { createMiddleware } from "hono/factory";

import { createAuth } from "../auth";
import { createDb } from "../db";
import { addToWideEvent } from "../logging/middleware";
import { type AdminSession, type Env, type HonoVariables } from "../shared";

type MiddlewareEnv = {
  Bindings: Env;
  Variables: HonoVariables;
};

class UnauthorizedError {
  readonly _tag = "UnauthorizedError";
}

class ForbiddenError {
  readonly _tag = "ForbiddenError";
}

const getSession = (auth: ReturnType<typeof createAuth>, headers: Headers) =>
  Effect.tryPromise({
    catch: () => new UnauthorizedError(),
    try: () => auth.api.getSession({ headers }),
  }).pipe(
    Effect.flatMap((session) =>
      session ? Effect.succeed(session) : Effect.fail(new UnauthorizedError())
    )
  );

const checkAdmin = (session: { user: { role?: string | null } }) =>
  session.user.role === "admin"
    ? Effect.succeed(session)
    : Effect.fail(new ForbiddenError());

export const requireAdmin = createMiddleware<MiddlewareEnv>(async (c, next) => {
  const db = createDb(c.env.DB);
  const auth = createAuth(c.env, db);

  const result = await Effect.runPromise(
    getSession(auth, c.req.raw.headers).pipe(
      Effect.flatMap(checkAdmin),
      Effect.match({
        onFailure: (error) => ({ error }),
        onSuccess: (session) => ({ session }),
      })
    )
  );

  if ("error" in result) {
    if (result.error._tag === "UnauthorizedError") {
      addToWideEvent(c, { adminAuth: "unauthorized" });
      return c.json({ error: "Unauthorized" }, 401);
    }
    addToWideEvent(c, { adminAuth: "forbidden" });
    return c.json({ error: "Admin access required" }, 403);
  }

  addToWideEvent(c, { adminAuth: "success" });
  c.set("session", result.session as AdminSession);
  await next();
});
