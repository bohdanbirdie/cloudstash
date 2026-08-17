import { createResourceServerChallenge } from "@better-auth/oauth-provider";
import { createInsufficientScopeError } from "better-auth/oauth2";

import type { Env } from "../shared";
import { mcpResource } from "./config";

export const mcpCorsOptions = (env: Env) => ({
  origin: new URL(env.BETTER_AUTH_URL).origin,
  methods: "POST, OPTIONS",
  headers:
    "Content-Type, Accept, Authorization, DPoP, mcp-session-id, MCP-Protocol-Version, Mcp-Method, Mcp-Name",
  exposeHeaders: "mcp-session-id, WWW-Authenticate, DPoP-Nonce",
});

export const withMcpCors = (response: Response, env: Env): Response => {
  const options = mcpCorsOptions(env);
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Headers", options.headers);
  headers.set("Access-Control-Allow-Methods", options.methods);
  headers.set("Access-Control-Allow-Origin", options.origin);
  headers.set("Access-Control-Expose-Headers", options.exposeHeaders);
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};

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
