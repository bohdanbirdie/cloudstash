import { describe, expect, it } from "vitest";

import {
  MCP_CONNECTION_GUIDANCE,
  MCP_LOCAL_ORIGIN_GUIDANCE,
  mcpEndpoint,
  mcpEndpointForOrigin,
} from "../mcp-connection";

describe("MCP connection guidance", () => {
  it("builds the MCP endpoint from the current application origin", () => {
    expect(mcpEndpointForOrigin("https://cloudstash.dev/settings")).toBe(
      "https://cloudstash.dev/mcp"
    );
    expect(mcpEndpointForOrigin("http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000/mcp"
    );
    expect(mcpEndpoint()).toBe("https://cloudstash.app/mcp");
  });

  it("documents the interoperable OAuth setup in one place", () => {
    expect(MCP_CONNECTION_GUIDANCE).toEqual({
      authentication: "OAuth",
      path: "/mcp",
      protocol: "Latest (2026-07-28)",
      registration: "Dynamic Client Registration (DCR)",
      scopeOverride: "openid offline_access links:read links:write",
      transport: "HTTP",
    });
    expect(MCP_LOCAL_ORIGIN_GUIDANCE).toContain("same origin");
  });
});
