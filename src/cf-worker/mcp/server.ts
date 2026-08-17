import { requireMcpAuth } from "@better-auth/mcp";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { Effect } from "effect";
import type { JWTPayload } from "jose";
import * as z from "zod/v4";

import type { SearchResult } from "../../livestore/queries/schemas";
import { createAuth } from "../auth";
import { createDb } from "../db";
import { enqueueLink } from "../ingest/service";
import { searchWorkspaceLinks } from "../links/handler";
import {
  MAX_LINK_SEARCH_QUERY_CHARS,
  MAX_LINK_SEARCH_RESULTS,
} from "../links/search-contract";
import { safeErrorInfo } from "../log-utils";
import { logSync } from "../logger";
import { getAppLayer } from "../runtime";
import type { Env } from "../shared";
import { authorizeMcpClaims } from "./auth";
import type { McpAuthorization } from "./auth";
import { MCP_READ_SCOPE, MCP_WRITE_SCOPE, mcpResource } from "./config";
import { insufficientScopeResponse, mcpCorsOptions, withMcpCors } from "./http";
import { MCP_TOOL_SCOPES, requiredScopesForRequest } from "./request-scope";

const logger = logSync("MCP");

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});

const toolError = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

export const runMcpToolHandler = async <Result>(
  operation: string,
  failureMessage: string,
  run: () => Promise<Result>
) => {
  try {
    return await run();
  } catch (cause) {
    logger.error(`${operation} escaped Effect boundary`, safeErrorInfo(cause));
    return toolError(failureMessage);
  }
};

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

export const McpSearchInput = z.object({
  query: z.string().trim().min(1).max(MAX_LINK_SEARCH_QUERY_CHARS),
});

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

const makeServer = (
  env: Env,
  authorization: McpAuthorization | null
): McpServer => {
  const server = new McpServer({ name: "cloudstash", version: "1.0.0" });

  server.registerTool(
    "search_links",
    {
      title: "Search Cloudstash links",
      description:
        "Return up to 20 relevance-ranked links from the active Cloudstash workspace.",
      inputSchema: McpSearchInput,
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      const scope = authorizeToolScope(authorization, "search_links");
      if (!scope.ok) return scope.result;

      return runMcpToolHandler(
        "MCP search_links",
        "Cloudstash could not search links",
        () =>
          searchWorkspaceLinks(scope.authorization.orgId, query, env).pipe(
            Effect.map((results) => textResult(toMcpSearchResults(results))),
            Effect.catchCause((cause) =>
              Effect.logError("MCP search_links failed").pipe(
                Effect.annotateLogs(safeErrorInfo(cause)),
                Effect.as(toolError("Cloudstash could not search links"))
              )
            ),
            Effect.withSpan("MCP.searchLinks"),
            Effect.provide(getAppLayer(env)),
            Effect.runPromise
          )
      );
    }
  );

  server.registerTool(
    "save_link",
    {
      title: "Save a Cloudstash link",
      description: "Save a URL to the active Cloudstash workspace.",
      inputSchema: z.object({ url: z.url() }),
      annotations: { idempotentHint: false, readOnlyHint: false },
    },
    async ({ url }) => {
      const scope = authorizeToolScope(authorization, "save_link");
      if (!scope.ok) return scope.result;
      return runMcpToolHandler(
        "MCP save_link",
        "Cloudstash could not save this link",
        () =>
          enqueueLink(scope.authorization, url, "mcp", env).pipe(
            Effect.as(textResult({ status: "queued" })),
            Effect.catchCause((cause) =>
              Effect.logError("MCP save_link failed").pipe(
                Effect.annotateLogs(safeErrorInfo(cause)),
                Effect.as(toolError("Cloudstash could not save this link"))
              )
            ),
            Effect.withSpan("MCP.saveLink"),
            Effect.provide(getAppLayer(env)),
            Effect.runPromise
          )
      );
    }
  );

  return server;
};

const accessToken = (request: Request): string => {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.replace(/^(?:Bearer|DPoP)\s+/i, "");
};

const toAuthInfo = (
  request: Request,
  authorization: McpAuthorization,
  env: Env
): AuthInfo => ({
  token: accessToken(request),
  clientId: authorization.clientId,
  scopes: [...authorization.scopes],
  expiresAt: authorization.expiresAt,
  resource: new URL(mcpResource(env)),
  extra: {
    orgId: authorization.orgId,
    userId: authorization.userId,
  },
});

const authorizationFailure = (cause: unknown): Response => {
  logger.error("authorization defect", safeErrorInfo(cause));
  return Response.json(
    { error: "Authorization backend unavailable" },
    { status: 503 }
  );
};

const handleVerifiedRequest = async (
  request: Request,
  claims: JWTPayload,
  env: Env,
  issuer: string
): Promise<Response> => {
  const resource = mcpResource(env);
  const authorization = await authorizeMcpClaims(claims, {
    issuer,
    resource,
  }).pipe(
    Effect.catchCause((cause) => Effect.succeed(authorizationFailure(cause))),
    Effect.provide(getAppLayer(env)),
    Effect.runPromise
  );
  if (authorization instanceof Response) return authorization;

  const scopes = await requiredScopesForRequest(request);
  if (scopes instanceof Response) return scopes;
  const granted = new Set(authorization.scopes);
  const missing = scopes.filter((scope) => !granted.has(scope));
  if (missing.length > 0) return insufficientScopeResponse(missing, env);

  const authInfo = toAuthInfo(request, authorization, env);
  const handler = makeMcpHandler(env, authorization);
  return handler.fetch(request, { authInfo });
};

const makeMcpHandler = (env: Env, authorization: McpAuthorization | null) => {
  const origin = new URL(env.BETTER_AUTH_URL);
  return createMcpHandler(() => makeServer(env, authorization), {
    route: "/mcp",
    legacy: "stateless",
    corsOptions: mcpCorsOptions(env),
    allowedHostnames: [origin.hostname],
    allowedOriginHostnames: [origin.hostname],
  });
};

export const handleMcpRequest = async (
  request: Request,
  env: Env
): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return makeMcpHandler(env, null).fetch(request);
  }

  try {
    const auth = createAuth(env, createDb(env.DB));
    const { baseURL: issuer } = await auth.$context;
    const response = await requireMcpAuth(
      auth,
      (verifiedRequest, claims) =>
        handleVerifiedRequest(verifiedRequest, claims, env, issuer),
      {
        challengeScopes: [MCP_READ_SCOPE, MCP_WRITE_SCOPE],
        resource: mcpResource(env),
      }
    )(request);
    return withMcpCors(response, env);
  } catch (cause) {
    return withMcpCors(authorizationFailure(cause), env);
  }
};
