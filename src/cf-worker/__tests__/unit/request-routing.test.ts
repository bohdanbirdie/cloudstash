import { describe, expect, it, vi } from "vitest";

import { routeAgentBeforeMcp } from "../../request-routing";

describe("Worker agent/MCP routing order", () => {
  it("returns an Agents SDK response without invoking MCP", async () => {
    const agentResponse = new Response("agent");
    const routeAgent = vi.fn(async () => agentResponse);
    const routeMcp = vi.fn(async () => new Response("mcp"));

    const response = await routeAgentBeforeMcp(
      new Request("https://cloudstash.test/agents/chat/workspace"),
      routeAgent,
      routeMcp
    );

    expect(response).toBe(agentResponse);
    expect(routeMcp).not.toHaveBeenCalled();
  });

  it("invokes MCP only after Agents declines the request", async () => {
    const mcpResponse = new Response("mcp");
    const routeAgent = vi.fn(async () => null);
    const routeMcp = vi.fn(async () => mcpResponse);

    const response = await routeAgentBeforeMcp(
      new Request("https://cloudstash.test/mcp"),
      routeAgent,
      routeMcp
    );

    expect(response).toBe(mcpResponse);
    expect(routeAgent).toHaveBeenCalledOnce();
  });
});
