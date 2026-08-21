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

const request = (id: number, method: string, params?: unknown) => ({
  jsonrpc: "2.0",
  id,
  method,
  ...(params === undefined ? {} : { params }),
});

describe("MCP request scope resolution", () => {
  it.effect("requires links:read for search_links", () =>
    requiredScopesForRequest(
      post(request(1, "tools/call", { name: "search_links" }))
    ).pipe(
      Effect.tap(({ parsedBody, scopes }) =>
        Effect.sync(() => {
          expect(scopes).toEqual([MCP_READ_SCOPE]);
          expect(parsedBody).toEqual(
            request(1, "tools/call", { name: "search_links" })
          );
        })
      )
    )
  );

  it.effect("requires links:write for save_link", () =>
    requiredScopesForRequest(
      post(request(1, "tools/call", { name: "save_link" }))
    ).pipe(
      Effect.tap(({ scopes }) =>
        Effect.sync(() => expect(scopes).toEqual([MCP_WRITE_SCOPE]))
      )
    )
  );

  it.effect("collects both scopes for a legacy batch", () =>
    requiredScopesForRequest(
      post([
        request(1, "tools/call", { name: "save_link" }),
        request(2, "tools/call", { name: "search_links" }),
        request(3, "tools/call", { name: "save_link" }),
      ])
    ).pipe(
      Effect.tap(({ scopes }) =>
        Effect.sync(() =>
          expect(scopes).toEqual([MCP_WRITE_SCOPE, MCP_READ_SCOPE])
        )
      )
    )
  );

  it.effect("leaves protocol methods unscoped and rejects unknown tools", () =>
    Effect.gen(function* () {
      const { scopes: protocolScopes } = yield* requiredScopesForRequest(
        post(request(1, "initialize", { name: "search_links" }))
      );
      expect(protocolScopes).toEqual([]);
      const unknown = yield* requiredScopesForRequest(
        post(request(1, "tools/call", { name: "unknown" }))
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

      const incompleteEnvelope = yield* requiredScopesForRequest(
        post({ method: "tools/call", params: { name: "search_links" } })
      ).pipe(Effect.flip);
      expect(incompleteEnvelope).toBeInstanceOf(McpRequestRejected);

      const unmapped = yield* requiredScopesForRequest(
        post(request(1, "tools/call", {}))
      ).pipe(Effect.flip);
      expect(unmapped).toBeInstanceOf(McpRequestRejected);

      const malformedMessage = yield* requiredScopesForRequest(
        post([null])
      ).pipe(Effect.flip);
      expect(malformedMessage).toBeInstanceOf(McpRequestRejected);

      const malformedMethod = yield* requiredScopesForRequest(
        post({ jsonrpc: "2.0", id: 1, method: 42 })
      ).pipe(Effect.flip);
      expect(malformedMethod).toBeInstanceOf(McpRequestRejected);
    })
  );
});
