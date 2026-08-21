import { Effect } from "effect";

import type { Env } from "../shared";
import { gateUserApiKeyCreate } from "./api-key-gate";
import { preparePublicOAuthClientRegistration } from "./oauth-client-registration";
import {
  bindConsentWorkspace,
  validateConsentWorkspaceBinding,
} from "./oauth-consent-binding";
import { cleanupExpiredOAuthTransientRecords } from "./oauth-transient-cleanup";
import { AuthClient } from "./service";

export const handleAuthRequest = Effect.fn("Auth.handleRequest")(function* (
  request: Request,
  env: Env
) {
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === "/api/auth/oauth2/token") {
    yield* cleanupExpiredOAuthTransientRecords(env.DB);
  }

  const preparedRequest = yield* preparePublicOAuthClientRegistration(request);
  if (preparedRequest instanceof Response) return preparedRequest;

  const denied = yield* gateUserApiKeyCreate(preparedRequest);
  if (denied) return denied;

  const auth = yield* AuthClient;
  const invalidConsent = yield* validateConsentWorkspaceBinding(
    preparedRequest,
    auth,
    env
  );
  if (invalidConsent) return invalidConsent;

  const response = yield* Effect.promise(() => auth.handler(preparedRequest));
  return yield* bindConsentWorkspace(response, preparedRequest, auth, env);
});
