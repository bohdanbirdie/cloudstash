import { createResourceServerChallenge } from "@better-auth/oauth-provider";
import { createInsufficientScopeError } from "better-auth/oauth2";

import type { Env } from "../shared";
import { mcpResource } from "./config";

export const authorizationBackendUnavailableResponse = (): Response =>
  Response.json(
    { error: "Authorization backend unavailable" },
    { status: 503 }
  );

export const mcpResourceChallengeResponse = (
  cause: unknown,
  resource: string,
  challengeScopes: readonly string[],
  error: { readonly code: number; readonly message?: string },
  onMissing = () =>
    Response.json({ error: "Invalid access token" }, { status: 401 })
): Response => {
  const challenge = createResourceServerChallenge(cause, resource, {
    challengeScopes: [...challengeScopes],
  });
  if (!challenge) return onMissing();

  const headers = new Headers(challenge.headers);
  headers.set("Content-Type", "application/json");
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: error.code, message: error.message ?? challenge.message },
      id: null,
    },
    { status: challenge.statusCode, headers }
  );
};

export const insufficientScopeResponse = (
  requiredScopes: readonly string[],
  env: Env
): Response =>
  mcpResourceChallengeResponse(
    createInsufficientScopeError([...requiredScopes]),
    mcpResource(env),
    requiredScopes,
    { code: -32001, message: "Insufficient scope" },
    () => {
      throw new Error(
        "Better Auth did not create an insufficient-scope challenge"
      );
    }
  );
