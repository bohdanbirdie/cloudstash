import { createResourceServerChallenge } from "@better-auth/oauth-provider";
import {
  createDpopReplayStore,
  enforceDpopBinding,
  isDpopBindingError,
  parseAccessTokenAuthorization,
  verifyJwsAccessToken,
} from "better-auth/oauth2";
import { APIError } from "better-call";
import type { JSONWebKeySet, JWTPayload } from "jose";
import { errors as joseErrors } from "jose";

import type { Auth } from "../auth";

const JOSE_INFRASTRUCTURE_ERROR_CODES = new Set([
  joseErrors.JWKSTimeout.code,
  joseErrors.JWKSInvalid.code,
  joseErrors.JWKSMultipleMatchingKeys.code,
]);

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

const verifySignature = async (
  token: string,
  options: {
    readonly audience: string;
    readonly issuer: string;
    readonly jwks: () => Promise<JSONWebKeySet>;
    readonly jwksCacheKey?: object;
  }
): Promise<JWTPayload> => {
  try {
    return await verifyJwsAccessToken(token, {
      jwksFetch: options.jwks,
      jwksCacheKey: options.jwksCacheKey,
      verifyOptions: {
        audience: options.audience,
        issuer: options.issuer,
      },
    });
  } catch (cause) {
    if (cause instanceof joseErrors.JWTExpired) {
      throw unauthorized("token expired");
    }
    if (cause instanceof joseErrors.JOSEError) {
      if (JOSE_INFRASTRUCTURE_ERROR_CODES.has(cause.code)) throw cause;
      throw unauthorized("invalid access token");
    }
    if (cause instanceof TypeError) {
      throw unauthorized("invalid access token");
    }
    throw cause;
  }
};

export const verifyMcpAccessToken = async (
  request: Request,
  options: {
    readonly audience: string;
    readonly issuer: string;
    readonly jwks: () => Promise<JSONWebKeySet>;
    readonly jwksCacheKey?: object;
    readonly replayStore: ReturnType<typeof createDpopReplayStore>;
  }
): Promise<JWTPayload> => {
  const authorization = parseAccessTokenAuthorization(
    request.headers.get("authorization")
  );
  if (!authorization?.token) {
    throw unauthorized("missing authorization header");
  }
  if (authorization.scheme === "Unknown") {
    throw unauthorized("authorization scheme must be Bearer or DPoP", {
      error: "invalid_token",
    });
  }

  const payload = await verifySignature(authorization.token, options);

  try {
    await enforceDpopBinding({
      authorization,
      method: request.method,
      payload,
      proofJwt: request.headers.get("dpop"),
      replayStore: options.replayStore,
      url: request.url,
    });
  } catch (cause) {
    if (isDpopBindingError(cause)) {
      throw unauthorized(cause.message, { error: cause.code });
    }
    throw cause;
  }

  return payload;
};

export const localMcpAccessTokenVerifier = async (
  auth: Auth,
  request: Request,
  options: {
    readonly audience: string;
    readonly issuer: string;
    readonly jwksCacheKey?: object;
  }
): Promise<JWTPayload> => {
  const { internalAdapter } = await auth.$context;
  return verifyMcpAccessToken(request, {
    ...options,
    jwks: () => auth.api.getJwks(),
    replayStore: createDpopReplayStore(internalAdapter),
  });
};

export const mcpAuthorizationChallenge = (
  cause: unknown,
  resource: string,
  challengeScopes: readonly string[]
): Response | undefined => {
  const challenge = createResourceServerChallenge(cause, resource, {
    challengeScopes,
  });
  if (!challenge) return undefined;

  const headers = new Headers(challenge.headers);
  headers.set("Content-Type", "application/json");
  return new Response(
    JSON.stringify({
      error: {
        code: -32e3,
        message: challenge.message,
      },
      id: null,
      jsonrpc: "2.0",
    }),
    { headers, status: challenge.statusCode }
  );
};
