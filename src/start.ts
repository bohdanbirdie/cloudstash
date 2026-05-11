import { createMiddleware, createStart } from "@tanstack/react-start";

import { createAuth } from "./cf-worker/auth";
import { createDb } from "./cf-worker/db";
import type { Env } from "./cf-worker/shared";
import { deriveAuthState } from "./lib/auth";

const authMiddleware = createMiddleware().server(
  async ({ next, request, context }) => {
    const db = createDb(context.env.DB);
    const auth = createAuth(context.env, db);
    const session = await auth.api.getSession({ headers: request.headers });
    return next({ context: { auth: deriveAuthState(session) } });
  }
);

export const startInstance = createStart(() => ({
  requestMiddleware: [authMiddleware],
}));

// Start reads `Register.server.requestContext` from `@tanstack/router-core`
// to type the `context` arg of `startHandler.fetch`. `config` is already
// declared on `@tanstack/react-start`'s Register by the auto-generated
// routeTree.gen.ts — don't redeclare it here.
declare module "@tanstack/router-core" {
  interface Register {
    server: {
      requestContext: { env: Env };
    };
  }
}
