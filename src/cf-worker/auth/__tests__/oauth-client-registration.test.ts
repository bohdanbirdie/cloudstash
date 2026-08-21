import { describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { validateOAuthClientRegistrationRequest } from "../oauth-client-registration";

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
    validateOAuthClientRegistrationRequest(
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

  it.effect("rejects oversized strings and arrays", () =>
    Effect.gen(function* () {
      const longName = yield* validateOAuthClientRegistrationRequest(
        registrationRequest({
          client_name: "x".repeat(513),
          token_endpoint_auth_method: "none",
        })
      );
      const manyRedirects = yield* validateOAuthClientRegistrationRequest(
        registrationRequest({
          redirect_uris: Array.from(
            { length: 21 },
            (_, index) => `https://client.test/callback/${index}`
          ),
          token_endpoint_auth_method: "none",
        })
      );

      expect(longName?.status).toBe(400);
      expect(manyRedirects?.status).toBe(400);
    })
  );

  it.effect("rejects confidential-client and unknown security metadata", () =>
    Effect.gen(function* () {
      for (const body of [
        {},
        { token_endpoint_auth_method: "private_key_jwt" },
        { token_endpoint_auth_method: "client_secret_basic" },
        { jwks: { keys: [] }, token_endpoint_auth_method: "none" },
        {
          jwks_uri: "https://client.test/jwks.json",
          token_endpoint_auth_method: "none",
        },
        {
          software_statement: "self-asserted",
          token_endpoint_auth_method: "none",
        },
      ]) {
        const response = yield* validateOAuthClientRegistrationRequest(
          registrationRequest(body)
        );
        expect(response?.status).toBe(400);
      }
    })
  );

  it.effect("ignores non-registration auth requests", () =>
    validateOAuthClientRegistrationRequest(
      new Request("https://cloudstash.test/api/auth/session")
    ).pipe(
      Effect.tap((response) => Effect.sync(() => expect(response).toBeNull()))
    )
  );
});
