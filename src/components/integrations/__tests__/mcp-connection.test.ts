import { describe, expect, it } from "vitest";

import {
  MCP_CONNECTION_GUIDANCE,
  MCP_LOCAL_ORIGIN_GUIDANCE,
  MCP_SETUP_STEPS,
  mcpAvailabilityState,
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

  it("does not turn a capability loading failure into an upgrade prompt", () => {
    expect(
      mcpAvailabilityState({
        allowed: false,
        alreadyPro: false,
        failed: true,
        loading: false,
      })
    ).toBe("unavailable");
    expect(
      mcpAvailabilityState({
        allowed: false,
        alreadyPro: false,
        failed: false,
        loading: false,
      })
    ).toBe("upgrade");
    expect(
      mcpAvailabilityState({
        allowed: true,
        alreadyPro: false,
        failed: false,
        loading: false,
      })
    ).toBe("available");
    expect(
      mcpAvailabilityState({
        allowed: false,
        alreadyPro: true,
        failed: false,
        loading: false,
      })
    ).toBe("disabled");
  });

  it("documents the interoperable OAuth setup in one place", () => {
    expect(MCP_CONNECTION_GUIDANCE).toEqual({
      authentication: "OAuth",
      path: "/mcp",
      protocol: "2026-07-28 (recommended); 2025-11-25 fallback",
      registration: "Dynamic Client Registration (DCR)",
      scopeOverride: "Leave blank — scopes are requested automatically",
      scopes: "links:read links:write",
      transport: "Streamable HTTP",
    });
    expect(MCP_SETUP_STEPS.map((step) => step.title)).toEqual([
      "Add the server.",
      "Choose OAuth.",
      "Approve the workspace.",
    ]);
    expect(MCP_LOCAL_ORIGIN_GUIDANCE).toContain("same origin");
  });
});
