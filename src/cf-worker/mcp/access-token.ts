import { APIError } from "better-auth/api";
import {
  createDpopReplayStore,
  enforceDpopBinding,
  isDpopBindingError,
  parseAccessTokenAuthorization,
  verifyJwsAccessToken,
} from "better-auth/oauth2";
import { Data, Effect } from "effect";
import type { JSONWebKeySet } from "jose";
import { errors as joseErrors } from "jose";

import type { Auth } from "../auth";
import { mcpResourceChallengeResponse } from "./http";

const JOSE_INFRASTRUCTURE_ERROR_CODES = new Set([
  joseErrors.JWKSTimeout.code,
  joseErrors.JWKSInvalid.code,
]);

export class McpAccessTokenRejected extends Data.TaggedError(
  "McpAccessTokenRejected"
)<{ readonly cause: unknown }> {}

export class McpAccessTokenBackendError extends Data.TaggedError(
  "McpAccessTokenBackendError"
)<{ readonly cause: unknown }> {}

const unauthorized = (
  message: string,
  details?: { error: "invalid_dpop_proof" | "invalid_token" }
) =>
  new APIError("UNAUTHORIZED", {
    message,
    ...(details
      ? { error: details.error, error_description: message }
      : undefined),
  });

const rejected = (cause: unknown) => new McpAccessTokenRejected({ cause });
const unavailable = (cause: unknown) =>
  new McpAccessTokenBackendError({ cause });

export const invalidMcpAccessToken = (message: string) =>
  rejected(unauthorized(message, { error: "invalid_token" }));

const signatureError = (cause: unknown) => {
  if (cause instanceof joseErrors.JWTExpired) {
    return rejected(unauthorized("token expired"));
  }
  if (cause instanceof joseErrors.JOSEError) {
    return JOSE_INFRASTRUCTURE_ERROR_CODES.has(cause.code)
      ? unavailable(cause)
      : rejected(unauthorized("invalid access token"));
  }
  return cause instanceof TypeError
    ? rejected(unauthorized("invalid access token"))
    : unavailable(cause);
};

export interface McpAccessTokenOptions {
  readonly audience: string;
  readonly issuer: string;
  readonly jwks: () => Promise<JSONWebKeySet>;
  readonly jwksCacheKey?: object;
  readonly replayStore: ReturnType<typeof createDpopReplayStore>;
}

export const verifyMcpAccessToken = Effect.fnUntraced(function* (
  request: Request,
  options: McpAccessTokenOptions
) {
  const authorization = parseAccessTokenAuthorization(
    request.headers.get("authorization")
  );
  if (!authorization?.token) {
    return yield* rejected(unauthorized("missing authorization header"));
  }
  if (authorization.scheme === "Unknown") {
    return yield* rejected(
      unauthorized("authorization scheme must be Bearer or DPoP", {
        error: "invalid_token",
      })
    );
  }

  const payload = yield* Effect.tryPromise({
    try: () =>
      verifyJwsAccessToken(authorization.token, {
        jwksFetch: options.jwks,
        jwksCacheKey: options.jwksCacheKey,
        verifyOptions: {
          audience: options.audience,
          issuer: options.issuer,
        },
      }),
    catch: signatureError,
  });

  yield* Effect.tryPromise({
    try: () =>
      enforceDpopBinding({
        authorization,
        method: request.method,
        payload,
        proofJwt: request.headers.get("dpop"),
        replayStore: options.replayStore,
        url: request.url,
      }),
    catch: (cause) =>
      isDpopBindingError(cause)
        ? rejected(unauthorized(cause.message, { error: cause.code }))
        : unavailable(cause),
  });

  return payload;
});

export const verifyLocalMcpAccessToken = Effect.fnUntraced(function* (
  auth: Auth,
  request: Request,
  options: {
    readonly audience: string;
    readonly issuer: string;
    readonly jwksCacheKey?: object;
  }
) {
  const { internalAdapter } = yield* Effect.tryPromise({
    try: () => auth.$context,
    catch: unavailable,
  });
  return yield* verifyMcpAccessToken(request, {
    ...options,
    jwks: () => auth.api.getJwks(),
    replayStore: createDpopReplayStore(internalAdapter),
  });
});

export const mcpAuthorizationChallenge = (
  error: McpAccessTokenRejected,
  resource: string,
  challengeScopes: readonly string[]
): Response =>
  mcpResourceChallengeResponse(error.cause, resource, challengeScopes, {
    code: -32e3,
  });
