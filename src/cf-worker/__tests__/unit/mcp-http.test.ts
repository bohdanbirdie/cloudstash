import { describe, expect, it } from "vitest";

import {
  authorizationBackendUnavailableResponse,
  insufficientScopeResponse,
  withMcpCors,
} from "../../mcp/http";

const env = {
  BETTER_AUTH_URL: "https://cloudstash.test",
} as Cloudflare.Env;

describe("MCP HTTP authorization responses", () => {
  it("keeps backend failures distinct from invalid credentials", async () => {
    const response = authorizationBackendUnavailableResponse(env);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Authorization backend unavailable",
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://cloudstash.test"
    );
  });

  it("returns a CORS-readable RFC 6750 insufficient-scope challenge", () => {
    const response = withMcpCors(
      insufficientScopeResponse(["links:write"], env),
      env
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://cloudstash.test"
    );
    expect(response.headers.get("Access-Control-Expose-Headers")).toContain(
      "WWW-Authenticate"
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST, OPTIONS"
    );
    expect(response.headers.get("WWW-Authenticate")).toBe(
      'Bearer error="insufficient_scope", scope="links:write", resource_metadata="https://cloudstash.test/.well-known/oauth-protected-resource/mcp", error_description="access token is missing required scope: links:write"'
    );
  });
});
