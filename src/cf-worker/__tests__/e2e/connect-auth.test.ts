import { describe, expect, it } from "@effect/vitest";
import { SELF } from "cloudflare:test";

// Characterization: WK-05-B.
//
// The "resolve a session or reject" block is inlined at six call sites across
// connect/telegram.ts, connect/raycast.ts and connect/extension.ts, while
// connect/x.ts has already extracted it as requireAuthorizedSession. Nothing
// pinned the unauthenticated behaviour of those endpoints, so hoisting the
// helper could not be verified.
//
// These fix the contract every connect endpoint shares: no session means 401.
// The refactor must keep them green.

interface Route {
  readonly method: string;
  readonly path: string;
  // Some handlers validate their body before resolving the session, so a
  // payload is needed to reach the auth check at all.
  readonly body?: string;
}

const ROUTES: Route[] = [
  { method: "POST", path: "/api/connect/raycast" },
  { method: "POST", path: "/api/connect/extension" },
  { method: "DELETE", path: "/api/connect/extension" },
  { method: "GET", path: "/api/connect/extension/account" },
  { method: "GET", path: "/api/connect/telegram/check?code=ABC123" },
  {
    body: JSON.stringify({ code: "ABC123" }),
    method: "POST",
    path: "/api/connect/telegram/confirm",
  },
  { method: "GET", path: "/api/connect/telegram/status" },
  { method: "DELETE", path: "/api/connect/telegram" },
  { method: "GET", path: "/api/connect/x/status" },
  { method: "DELETE", path: "/api/connect/x" },
  { method: "POST", path: "/api/connect/x/pause" },
  { method: "POST", path: "/api/connect/x/resume" },
];

describe("connect endpoints without a session", () => {
  it.each(ROUTES)(
    "$method $path returns 401",
    async ({ body, method, path }) => {
      const res = await SELF.fetch(`http://worker${path}`, {
        body:
          method === "GET" || method === "DELETE" ? undefined : (body ?? "{}"),
        headers: { "Content-Type": "application/json" },
        method,
      });

      expect(res.status).toBe(401);
    }
  );
});
