import { createMiddleware, createStart } from "@tanstack/react-start";

import { createAuth } from "./cf-worker/auth";
import { createDb } from "./cf-worker/db";
import { deriveAuthState } from "./lib/auth";

const authMiddleware = createMiddleware().server(
  async ({ next, request, context }) => {
    // BETTER_AUTH_SECRET is a Cloudflare secret, never present in
    // wrangler.jsonc. The vite-build prerender harness provisions CF
    // bindings (D1, KV, etc.) but not secrets, so we detect prerender by
    // its absence and render anonymously — the prerendered pages (/, legal,
    // contact) are all public.
    if (!context.env.BETTER_AUTH_SECRET) {
      return next({ context: { auth: null } });
    }
    const db = createDb(context.env.DB);
    const auth = createAuth(context.env, db);
    const session = await auth.api.getSession({ headers: request.headers });
    return next({ context: { auth: deriveAuthState(session) } });
  }
);

export const startInstance = createStart(() => ({
  requestMiddleware: [authMiddleware],
}));

// The `server.requestContext` augmentation that types `context.env` lives in
// src/server.ts (next to the server entry, per the TanStack Start docs).
