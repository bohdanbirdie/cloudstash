import { createMiddleware, createStart } from "@tanstack/react-start";

import { createAuth } from "./cf-worker/auth";
import { createDb } from "./cf-worker/db";
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

// The `server.requestContext` augmentation that types `context.env` lives in
// src/server.ts (next to the server entry, per the TanStack Start docs).
