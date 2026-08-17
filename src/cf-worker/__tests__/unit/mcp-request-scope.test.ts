import { describe, expect, it } from "vitest";

import { MCP_READ_SCOPE, MCP_WRITE_SCOPE } from "../../mcp/config";
import { requiredScopesForRequest } from "../../mcp/request-scope";

const post = (body: unknown, headers?: HeadersInit): Request =>
  new Request("https://cloudstash.test/mcp", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("MCP request scope resolution", () => {
  it("requires links:read for search_links", async () => {
    await expect(
      requiredScopesForRequest(
        post({ method: "tools/call", params: { name: "search_links" } })
      )
    ).resolves.toEqual([MCP_READ_SCOPE]);
  });

  it("requires links:write for save_link", async () => {
    await expect(
      requiredScopesForRequest(
        post({ method: "tools/call", params: { name: "save_link" } })
      )
    ).resolves.toEqual([MCP_WRITE_SCOPE]);
  });

  it("collects both scopes for a legacy batch", async () => {
    await expect(
      requiredScopesForRequest(
        post([
          { method: "tools/call", params: { name: "save_link" } },
          { method: "tools/call", params: { name: "search_links" } },
          { method: "tools/call", params: { name: "save_link" } },
        ])
      )
    ).resolves.toEqual([MCP_WRITE_SCOPE, MCP_READ_SCOPE]);
  });

  it("leaves protocol methods unscoped and rejects unknown tools", async () => {
    await expect(
      requiredScopesForRequest(
        post({ method: "initialize", params: { name: "search_links" } })
      )
    ).resolves.toEqual([]);
    const unknown = await requiredScopesForRequest(
      post({ method: "tools/call", params: { name: "unknown" } })
    );
    expect(unknown).toBeInstanceOf(Response);
    expect((unknown as Response).status).toBe(403);
  });

  it("fails closed for malformed JSON and tool calls without a scope mapping", async () => {
    const malformed = await requiredScopesForRequest(post("{"));
    expect(malformed).toBeInstanceOf(Response);
    expect((malformed as Response).status).toBe(400);

    const unmapped = await requiredScopesForRequest(
      post({ method: "tools/call", params: {} })
    );
    expect(unmapped).toBeInstanceOf(Response);
    expect((unmapped as Response).status).toBe(400);

    const malformedMessage = await requiredScopesForRequest(post([null]));
    expect(malformedMessage).toBeInstanceOf(Response);
    expect((malformedMessage as Response).status).toBe(400);

    const malformedMethod = await requiredScopesForRequest(
      post({ method: 42 })
    );
    expect(malformedMethod).toBeInstanceOf(Response);
    expect((malformedMethod as Response).status).toBe(400);
  });

  it("rejects a declared oversized request before parsing", async () => {
    const response = await requiredScopesForRequest(
      post("{}", { "Content-Length": String(1024 * 1024 + 1) })
    );
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(413);
  });
});
