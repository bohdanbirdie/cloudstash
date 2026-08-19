import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { Cause, Effect } from "effect";
import type { JWTPayload } from "jose";

import { initializeMcpOAuthResource } from "../auth/mcp-resource";
import { AuthClient } from "../auth/service";
import { maskId, safeErrorInfo } from "../log-utils";
import { getAppLayer } from "../runtime";
import type { Env } from "../shared";
import { OtelTracingLive } from "../tracing";
import {
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
  mcpCorsOptions,
  withMcpCors,
} from "./http";
import { requiredScopesForRequest } from "./request-scope";
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

const authorizationFailure = Effect.fnUntraced(function* (
  cause: unknown,
  env: Env
) {
  yield* Effect.logError("MCP authorization failed").pipe(
    Effect.annotateLogs(safeErrorInfo(cause))
  );
  return authorizationBackendUnavailableResponse(env);
});

const handleVerifiedRequestEffect = Effect.fn("MCP.handleVerifiedRequest")(
  function* (request: Request, claims: JWTPayload, env: Env, issuer: string) {
    const resource = mcpResource(env);
    const authorization = yield* authorizeMcpClaims(claims, {
      issuer,
      resource,
    });
    if (authorization instanceof Response) return authorization;

    yield* Effect.annotateCurrentSpan("orgId", maskId(authorization.orgId));
    yield* Effect.annotateCurrentSpan(
      "clientId",
      maskId(authorization.clientId)
    );

    const scopes = yield* requiredScopesForRequest(request);
    if (scopes instanceof Response) return scopes;
    const granted = new Set(authorization.scopes);
    const missing = scopes.filter((scope) => !granted.has(scope));
    if (missing.length > 0) return insufficientScopeResponse(missing, env);

    const authInfo = toAuthInfo(request, authorization, env);
    const handler = makeMcpHandler(env, authorization);
    return yield* Effect.promise(() => handler.fetch(request, { authInfo }));
  }
);

const makeMcpHandler = (env: Env, authorization: McpAuthorization | null) => {
  const origin = new URL(env.BETTER_AUTH_URL);
  return createMcpHandler(() => makeMcpServer(env, authorization), {
    route: "/mcp",
    legacy: "stateless",
    corsOptions: mcpCorsOptions(env),
    allowedHostnames: [origin.hostname],
    allowedOriginHostnames: [origin.hostname],
  });
};

const handleMcpRequestEffect = Effect.fnUntraced(function* (
  request: Request,
  env: Env
) {
  yield* initializeMcpOAuthResource(env);

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
  const response = yield* handleVerifiedRequestEffect(
    request,
    claims,
    env,
    issuer
  );
  return withMcpCors(response, env);
});

export const handleMcpRequest = (
  request: Request,
  env: Env
): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return Effect.promise(() => makeMcpHandler(env, null).fetch(request)).pipe(
      Effect.withSpan("MCP.preflight"),
      Effect.provide(OtelTracingLive),
      Effect.runPromise
    );
  }

  return handleMcpRequestEffect(request, env).pipe(
    Effect.catchTag("McpAccessTokenRejected", (error) =>
      Effect.succeed(
        withMcpCors(
          mcpAuthorizationChallenge(error, mcpResource(env), [
            MCP_READ_SCOPE,
            MCP_WRITE_SCOPE,
          ]),
          env
        )
      )
    ),
    Effect.withSpan("MCP.handleRequest"),
    Effect.catchTag("McpAccessTokenBackendError", (error) =>
      authorizationFailure(error.cause, env)
    ),
    Effect.catchTag("McpAuthorizationBackendError", (error) =>
      authorizationFailure(error.cause, env)
    ),
    Effect.catchTag("DbError", (error) =>
      authorizationFailure(error.cause, env)
    ),
    Effect.catchCause((cause) =>
      authorizationFailure(Cause.squash(cause), env)
    ),
    Effect.provide(getAppLayer(env)),
    Effect.catchCause((cause) =>
      authorizationFailure(Cause.squash(cause), env).pipe(
        Effect.provide(OtelTracingLive)
      )
    ),
    Effect.runPromise
  );
};
