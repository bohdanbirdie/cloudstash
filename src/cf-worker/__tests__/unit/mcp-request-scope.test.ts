import { describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { MCP_READ_SCOPE, MCP_WRITE_SCOPE } from "../../mcp/config";
import {
  McpRequestRejected,
  requiredScopesForRequest,
} from "../../mcp/request-scope";

const post = (body: unknown, headers?: HeadersInit): Request =>
  new Request("https://cloudstash.test/mcp", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("MCP request scope resolution", () => {
  it.effect("requires links:read for search_links", () =>
    requiredScopesForRequest(
      post({ method: "tools/call", params: { name: "search_links" } })
    ).pipe(
      Effect.tap((scopes) =>
        Effect.sync(() => expect(scopes).toEqual([MCP_READ_SCOPE]))
      )
    )
  );

  it.effect("requires links:write for save_link", () =>
    requiredScopesForRequest(
      post({ method: "tools/call", params: { name: "save_link" } })
    ).pipe(
      Effect.tap((scopes) =>
        Effect.sync(() => expect(scopes).toEqual([MCP_WRITE_SCOPE]))
      )
    )
  );

  it.effect("collects both scopes for a legacy batch", () =>
    requiredScopesForRequest(
      post([
        { method: "tools/call", params: { name: "save_link" } },
        { method: "tools/call", params: { name: "search_links" } },
        { method: "tools/call", params: { name: "save_link" } },
      ])
    ).pipe(
      Effect.tap((scopes) =>
        Effect.sync(() =>
          expect(scopes).toEqual([MCP_WRITE_SCOPE, MCP_READ_SCOPE])
        )
      )
    )
  );

  it.effect("leaves protocol methods unscoped and rejects unknown tools", () =>
    Effect.gen(function* () {
      const protocolScopes = yield* requiredScopesForRequest(
        post({ method: "initialize", params: { name: "search_links" } })
      );
      expect(protocolScopes).toEqual([]);
      const unknown = yield* requiredScopesForRequest(
        post({ method: "tools/call", params: { name: "unknown" } })
      ).pipe(Effect.flip);
      expect(unknown).toMatchObject({
        _tag: "McpRequestRejected",
        status: 403,
      });
    })
  );

  it.effect("fails closed for malformed JSON and unmapped tool calls", () =>
    Effect.gen(function* () {
      const malformed = yield* requiredScopesForRequest(post("{")).pipe(
        Effect.flip
      );
      expect(malformed).toBeInstanceOf(McpRequestRejected);

      const unmapped = yield* requiredScopesForRequest(
        post({ method: "tools/call", params: {} })
      ).pipe(Effect.flip);
      expect(unmapped).toBeInstanceOf(McpRequestRejected);

      const malformedMessage = yield* requiredScopesForRequest(
        post([null])
      ).pipe(Effect.flip);
      expect(malformedMessage).toBeInstanceOf(McpRequestRejected);

      const malformedMethod = yield* requiredScopesForRequest(
        post({ method: 42 })
      ).pipe(Effect.flip);
      expect(malformedMethod).toBeInstanceOf(McpRequestRejected);
    })
  );
});
