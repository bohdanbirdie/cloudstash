import { describe, expect, it } from "vitest";

import {
  mcpAvailabilityState,
  mcpCodingAgentSetup,
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

  it("builds a portable agent setup command", () => {
    expect(mcpCodingAgentSetup("https://cloudstash.dev/mcp")).toBe(
      "npx add-mcp https://cloudstash.dev/mcp --name cloudstash --global"
    );
  });
});
