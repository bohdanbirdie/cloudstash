import { createMiddleware, createStart } from "@tanstack/react-start";

import { createAuth } from "./cf-worker/auth";
import { createDb } from "./cf-worker/db";
import { deriveAuthState } from "./lib/auth";

const authMiddleware = createMiddleware().server(
  async ({ next, request, context }) => {
    // vite's prerender harness invokes the SSR handler from Node without
    // going through src/server.ts, so context.env is undefined there. At
    // runtime on Cloudflare, server.ts always passes context.env. The pages
    // we prerender are public — render anonymous.
    const env = (context as { env?: typeof context.env }).env;
    if (!env) return next({ context: { auth: null } });
    const db = createDb(env.DB);
    const auth = createAuth(env, db);
    const session = await auth.api.getSession({ headers: request.headers });
    return next({ context: { auth: deriveAuthState(session) } });
  }
);

export const startInstance = createStart(() => ({
  requestMiddleware: [authMiddleware],
}));

// The `server.requestContext` augmentation that types `context.env` lives in
// src/server.ts (next to the server entry, per the TanStack Start docs).
