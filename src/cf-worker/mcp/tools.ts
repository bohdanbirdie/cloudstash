import { McpServer } from "@modelcontextprotocol/server";
import { Cause, Effect, Schema } from "effect";

import { HttpUrlFromString } from "../../lib/http-url";
import type { SearchResult } from "../../livestore/queries/schemas";
import { enqueueLink } from "../ingest/service";
import { searchWorkspaceLinks } from "../links/handler";
import {
  LinkSearchQuery,
  MAX_LINK_SEARCH_RESULTS,
} from "../links/search-contract";
import { maskId, safeErrorInfo } from "../log-utils";
import type { Env } from "../shared";
import { OtelTracingLive } from "../tracing";
import type { McpAuthorization } from "./auth";
import { MCP_TOOL_SCOPES } from "./request-scope";

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});

const toolError = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

export const runMcpToolHandler = <Result, Error, Requirements>(
  operation: string,
  failureMessage: string,
  effect: Effect.Effect<Result, Error, Requirements>
) =>
  effect.pipe(
    Effect.catchCause((cause) =>
      Effect.logError(`${operation} failed`).pipe(
        Effect.annotateLogs(safeErrorInfo(Cause.squash(cause))),
        Effect.as(toolError(failureMessage))
      )
    )
  );

export const authorizeToolScope = (
  authorization: McpAuthorization | null,
  tool: keyof typeof MCP_TOOL_SCOPES
) => {
  const scope = MCP_TOOL_SCOPES[tool];
  if (!authorization?.scopes.includes(scope)) {
    return {
      ok: false as const,
      result: toolError(`Missing required scope: ${scope}`),
    };
  }
  return { authorization, ok: true as const };
};

const toMcpSchema = <S extends Schema.ConstraintDecoder<unknown>>(schema: S) =>
  Schema.toStandardJSONSchemaV1(Schema.toStandardSchemaV1(schema));

export const McpSearchInput = toMcpSchema(
  Schema.Struct({ query: LinkSearchQuery })
);
export const McpSaveInput = toMcpSchema(
  Schema.Struct({ url: HttpUrlFromString })
);

export const toMcpSearchResults = (results: readonly SearchResult[]) =>
  results.slice(0, MAX_LINK_SEARCH_RESULTS).map((result) => ({
    completedAt: result.completedAt,
    createdAt: result.createdAt,
    description: result.description,
    domain: result.domain,
    id: result.id,
    score: result.score,
    status: result.status,
    summary: result.summary,
    title: result.title,
    url: result.url,
  }));

export const makeMcpServer = (
  env: Env,
  authorization: McpAuthorization | null
): McpServer => {
  const server = new McpServer({ name: "cloudstash", version: "1.0.0" });

  server.registerTool(
    "search_links",
    {
      title: "Search Cloudstash links",
      description:
        "Return up to 20 relevance-ranked links from the Cloudstash workspace approved during connection.",
      inputSchema: McpSearchInput,
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      const scope = authorizeToolScope(authorization, "search_links");
      if (!scope.ok) return scope.result;

      return runMcpToolHandler(
        "MCP search_links",
        "Cloudstash could not search links",
        searchWorkspaceLinks(scope.authorization.orgId, query, env).pipe(
          Effect.map((results) => textResult(toMcpSearchResults(results))),
          Effect.withSpan("MCP.searchLinks", {
            attributes: { orgId: maskId(scope.authorization.orgId) },
          })
        )
      ).pipe(Effect.provide(OtelTracingLive), Effect.runPromise);
    }
  );

  server.registerTool(
    "save_link",
    {
      title: "Save a Cloudstash link",
      description:
        "Save a URL to the Cloudstash workspace approved during connection.",
      inputSchema: McpSaveInput,
      annotations: { idempotentHint: false, readOnlyHint: false },
    },
    async ({ url }) => {
      const scope = authorizeToolScope(authorization, "save_link");
      if (!scope.ok) return scope.result;

      return runMcpToolHandler(
        "MCP save_link",
        "Cloudstash could not save this link",
        enqueueLink(scope.authorization, url.href, "mcp", env).pipe(
          Effect.as(textResult({ status: "queued" })),
          Effect.withSpan("MCP.saveLink", {
            attributes: { orgId: maskId(scope.authorization.orgId) },
          })
        )
      ).pipe(Effect.provide(OtelTracingLive), Effect.runPromise);
    }
  );

  return server;
};
