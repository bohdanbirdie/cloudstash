import { describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { enforcePublicOAuthClientRegistration } from "../oauth-client-registration";

const registrationRequest = (
  body: unknown,
  headers: HeadersInit = {}
): Request => {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Content-Type", "application/json");
  return new Request("https://cloudstash.test/api/auth/oauth2/register", {
    body: JSON.stringify(body),
    headers: requestHeaders,
    method: "POST",
  });
};

describe("OAuth dynamic client registration boundary", () => {
  it.effect("accepts bounded native MCP client metadata", () =>
    enforcePublicOAuthClientRegistration(
      registrationRequest({
        application_type: "native",
        client_name: "MCPJam - Cloudstash",
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
        token_endpoint_auth_method: "none",
      })
    ).pipe(
      Effect.tap((response) => Effect.sync(() => expect(response).toBeNull()))
    )
  );

  it.effect("leaves standard metadata validation to Better Auth", () =>
    enforcePublicOAuthClientRegistration(
      registrationRequest({
        dpop_bound_access_tokens: true,
        jwks_uri: "https://client.test/jwks.json",
        software_statement: "self-asserted",
        subject_type: "public",
        token_endpoint_auth_method: "none",
      })
    ).pipe(
      Effect.tap((response) => Effect.sync(() => expect(response).toBeNull()))
    )
  );

  it.effect("rejects non-public clients", () =>
    Effect.gen(function* () {
      for (const body of [
        {},
        { token_endpoint_auth_method: "private_key_jwt" },
        { token_endpoint_auth_method: "client_secret_basic" },
      ]) {
        const response = yield* enforcePublicOAuthClientRegistration(
          registrationRequest(body)
        );
        expect(response?.status).toBe(400);
      }
    })
  );

  it.effect("ignores non-registration auth requests", () =>
    enforcePublicOAuthClientRegistration(
      new Request("https://cloudstash.test/api/auth/session")
    ).pipe(
      Effect.tap((response) => Effect.sync(() => expect(response).toBeNull()))
    )
  );
});
