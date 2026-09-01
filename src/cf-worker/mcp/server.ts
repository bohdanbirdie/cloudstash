import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { Cause, Effect } from "effect";
import type { JWTPayload } from "jose";

import { cleanupExpiredOAuthTransientRecords } from "../auth/oauth-transient-cleanup";
import { AuthClient } from "../auth/service";
import { workspaceAccessHttpResponse } from "../auth/workspace-access-http";
import { capabilityDeniedResponse } from "../billing/errors";
import { maskId, safeErrorInfo } from "../log-utils";
import { getAppLayer, provideResponse } from "../runtime";
import type { Env } from "../shared";
import {
  invalidMcpAccessToken,
  McpAccessTokenBackendError,
  mcpAuthorizationChallenge,
  verifyLocalMcpAccessToken,
} from "./access-token";
import { authorizeMcpClaims } from "./auth";
import type { McpAuthorization } from "./auth";
import { MCP_READ_SCOPE, MCP_WRITE_SCOPE, mcpResource } from "./config";
import {
  authorizationBackendUnavailableResponse,
  insufficientScopeResponse,
} from "./http";
import {
  McpInsufficientScopeError,
  requiredScopesForRequest,
} from "./request-scope";
import { makeMcpServer } from "./tools";

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

const authorizationFailure = Effect.fnUntraced(function* (cause: unknown) {
  yield* Effect.logError("MCP authorization failed").pipe(
    Effect.annotateLogs(safeErrorInfo(cause))
  );
  return authorizationBackendUnavailableResponse();
});

const handleVerifiedRequestEffect = Effect.fnUntraced(function* (
  request: Request,
  claims: JWTPayload,
  env: Env
) {
  const authorization = yield* authorizeMcpClaims(claims, env);

  yield* Effect.annotateCurrentSpan("orgId", maskId(authorization.orgId));
  yield* Effect.annotateCurrentSpan("clientId", maskId(authorization.clientId));

  const { parsedBody, scopes } = yield* requiredScopesForRequest(request);
  const granted = new Set(authorization.scopes);
  const missing = scopes.filter((scope) => !granted.has(scope));
  if (missing.length > 0) {
    return yield* new McpInsufficientScopeError({ scopes: missing });
  }

  const authInfo = toAuthInfo(request, authorization, env);
  const handler = makeMcpHandler(env, authorization);
  return yield* Effect.promise(() =>
    handler.fetch(request, { authInfo, parsedBody })
  );
});

const makeMcpHandler = (env: Env, authorization: McpAuthorization) => {
  const origin = new URL(env.BETTER_AUTH_URL);
  return createMcpHandler(() => makeMcpServer(env, authorization), {
    corsOptions: false,
    allowedHostnames: [origin.hostname],
    allowedOriginHostnames: [origin.hostname],
  });
};

const handleMcpRequestEffect = Effect.fnUntraced(function* (
  request: Request,
  env: Env
) {
  if (request.headers.has("dpop")) {
    yield* cleanupExpiredOAuthTransientRecords(env.DB);
  }

  const auth = yield* AuthClient;
  const { baseURL: issuer } = yield* Effect.tryPromise({
    try: () => auth.$context,
    catch: (cause) => new McpAccessTokenBackendError({ cause }),
  });
  const resource = mcpResource(env);
  const claims = yield* verifyLocalMcpAccessToken(auth, request, {
    audience: resource,
    issuer,
    jwksCacheKey: env.DB,
  });
  const response = yield* handleVerifiedRequestEffect(request, claims, env);
  return response;
});

export const handleMcpRequest = (
  request: Request,
  env: Env
): Promise<Response> =>
  provideResponse(
    handleMcpRequestEffect(request, env).pipe(
      Effect.catchTag("McpAccessTokenRejected", (error) =>
        Effect.succeed(
          mcpAuthorizationChallenge(error, mcpResource(env), [
            MCP_READ_SCOPE,
            MCP_WRITE_SCOPE,
          ])
        )
      ),
      Effect.catchTags({
        CapabilityDisabledError: (error) =>
          Effect.succeed(capabilityDeniedResponse(error)),
        McpInsufficientScopeError: (error) =>
          Effect.succeed(insufficientScopeResponse(error.scopes, env)),
        McpInvalidClaimsError: () =>
          Effect.succeed(
            mcpAuthorizationChallenge(
              invalidMcpAccessToken("access token is missing required claims"),
              mcpResource(env),
              [MCP_READ_SCOPE, MCP_WRITE_SCOPE]
            )
          ),
        McpRequestRejected: (error) =>
          Effect.succeed(
            Response.json({ error: error.message }, { status: error.status })
          ),
        McpWorkspaceAccessDenied: (error) =>
          workspaceAccessHttpResponse(error.cause),
        OrgNotFoundError: () =>
          Effect.logWarning("MCP authorization: organization not found").pipe(
            Effect.as(Response.json({ error: "Forbidden" }, { status: 403 }))
          ),
      }),
      Effect.withSpan("MCP.handleRequest"),
      Effect.catchTag("McpAccessTokenBackendError", (error) =>
        authorizationFailure(error.cause)
      ),
      Effect.catchTag("McpAuthorizationBackendError", (error) =>
        authorizationFailure(error.cause)
      ),
      Effect.catchTag("DbError", (error) => authorizationFailure(error.cause)),
      Effect.catchCause((cause) => authorizationFailure(Cause.squash(cause)))
    ),
    getAppLayer(env),
    authorizationFailure
  ).pipe(Effect.runPromise);
