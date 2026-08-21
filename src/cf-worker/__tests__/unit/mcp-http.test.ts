import { describe, expect, it } from "vitest";

import {
  authorizationBackendUnavailableResponse,
  insufficientScopeResponse,
} from "../../mcp/http";

const env = {
  BETTER_AUTH_URL: "https://cloudstash.test",
} as Cloudflare.Env;

describe("MCP HTTP authorization responses", () => {
  it("keeps backend failures distinct from invalid credentials", async () => {
    const response = authorizationBackendUnavailableResponse();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Authorization backend unavailable",
    });
  });

  it("returns an RFC 6750 insufficient-scope challenge", async () => {
    const response = insufficientScopeResponse(["links:write"], env);

    expect(response.status).toBe(403);
    expect(response.headers.get("WWW-Authenticate")).toBe(
      'Bearer error="insufficient_scope", scope="links:write", resource_metadata="https://cloudstash.test/.well-known/oauth-protected-resource/mcp", error_description="access token is missing required scope: links:write"'
    );
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Insufficient scope" },
      id: null,
    });
  });
});
