import { Effect } from "effect";

import type { Env } from "../shared";
import { gateUserApiKeyCreate } from "./api-key-gate";
import { initializeMcpOAuthResource } from "./mcp-resource";
import { validateOAuthClientRegistrationRequest } from "./oauth-client-registration";
import {
  bindConsentWorkspace,
  validateConsentWorkspaceBinding,
} from "./oauth-consent-binding";
import { AuthClient } from "./service";
import { cleanupExpiredVerifications } from "./verification-cleanup";

export const handleAuthRequest = Effect.fn("Auth.handleRequest")(function* (
  request: Request,
  env: Env
) {
  yield* initializeMcpOAuthResource(env);

  const url = new URL(request.url);
  if (
    request.method === "POST" &&
    url.pathname === "/api/auth/oauth2/token" &&
    request.headers.has("dpop")
  ) {
    yield* cleanupExpiredVerifications(env.DB);
  }

  const invalidRegistration =
    yield* validateOAuthClientRegistrationRequest(request);
  if (invalidRegistration) return invalidRegistration;

  const denied = yield* gateUserApiKeyCreate(request);
  if (denied) return denied;

  const auth = yield* AuthClient;
  const invalidConsent = yield* validateConsentWorkspaceBinding(
    request,
    auth,
    env
  );
  if (invalidConsent) return invalidConsent;

  const response = yield* Effect.promise(() => auth.handler(request));
  return yield* bindConsentWorkspace(response, request, auth, env);
});
