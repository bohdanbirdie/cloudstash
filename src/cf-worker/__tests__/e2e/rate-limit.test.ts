import { describe, expect, it } from "@effect/vitest";
import { env } from "cloudflare:test";

import { fetch as workerFetch } from "../../index";

// WK-01-A. Rate limiting reaches its routes two different ways: /mcp is a Hono
// middleware registered after the CORS middleware, and everything else is
// matched against RATE_LIMITED_PREFIXES in fetch() before Hono sees the
// request. mcp-oauth.test.ts covers the /mcp path and its CORS interaction;
// nothing covered the prefix list, so the placement could have been "tidied"
// into one mechanism without anything failing.

const LIMITED = [
  { method: "POST", path: "/sync" },
  { method: "GET", path: "/api/auth/me" },
  { method: "POST", path: "/api/invites/redeem" },
];

const call = (path: string, method: string, limiterSucceeds: boolean) =>
  workerFetch(
    new Request(`http://worker${path}`, {
      body: method === "GET" ? undefined : "{}",
      headers: {
        "cf-connecting-ip": "192.0.2.44",
        "Content-Type": "application/json",
      },
      method,
    }) as never,
    {
      ...env,
      SYNC_RATE_LIMITER: { limit: async () => ({ success: limiterSucceeds }) },
    } as never,
    {} as never
  );

describe("prefix-matched rate limiting", () => {
  it.each(LIMITED)("$method $path returns 429 when limited", async (route) => {
    const response = await call(route.path, route.method, false);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toEqual({ error: "Rate limit exceeded" });
  });

  it.each(LIMITED)("$method $path proceeds when allowed", async (route) => {
    const response = await call(route.path, route.method, true);

    // Each route answers differently — the point is only that the limiter let
    // it through rather than short-circuiting.
    expect(response.status).not.toBe(429);
  });

  it("leaves an unlimited route alone even while the limiter refuses", async () => {
    const response = await call("/api/health", "GET", false);
    expect(response.status).not.toBe(429);
  });
});
