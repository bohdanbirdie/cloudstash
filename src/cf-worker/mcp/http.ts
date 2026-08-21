import { createResourceServerChallenge } from "@better-auth/oauth-provider";
import { createInsufficientScopeError } from "better-auth/oauth2";

import type { Env } from "../shared";
import { mcpResource } from "./config";

export const authorizationBackendUnavailableResponse = (): Response =>
  Response.json(
    { error: "Authorization backend unavailable" },
    { status: 503 }
  );

export const insufficientScopeResponse = (
  requiredScopes: readonly string[],
  env: Env
): Response => {
  const challenge = createResourceServerChallenge(
    createInsufficientScopeError([...requiredScopes]),
    mcpResource(env),
    { challengeScopes: [...requiredScopes] }
  );
  if (!challenge) {
    throw new Error(
      "Better Auth did not create an insufficient-scope challenge"
    );
  }

  const headers = new Headers(challenge.headers);
  headers.set("Content-Type", "application/json");
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32001, message: "Insufficient scope" },
      id: null,
    },
    { status: challenge.statusCode, headers }
  );
};
