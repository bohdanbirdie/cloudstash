import { describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { preparePublicOAuthClientRegistration } from "../oauth-client-registration";

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
    preparePublicOAuthClientRegistration(
      registrationRequest({
        application_type: "native",
        client_name: "MCPJam - Cloudstash",
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
        token_endpoint_auth_method: "none",
      })
    ).pipe(
      Effect.tap((result) =>
        Effect.sync(() => expect(result).toBeInstanceOf(Request))
      )
    )
  );

  it.effect(
    "infers native for an omitted exact-loopback application type",
    () =>
      Effect.gen(function* () {
        const result = yield* preparePublicOAuthClientRegistration(
          registrationRequest(
            {
              client_name: "Executor",
              grant_types: ["authorization_code", "refresh_token"],
              redirect_uris: ["http://localhost:4789/api/oauth/callback"],
              response_types: ["code"],
              token_endpoint_auth_method: "none",
            },
            { "x-registration-test": "preserved" }
          )
        );

        expect(result).toBeInstanceOf(Request);
        if (!(result instanceof Request)) return;
        expect(result.headers.get("x-registration-test")).toBe("preserved");
        const body = yield* Effect.promise(() => result.json());
        expect(body).toMatchObject({
          application_type: "native",
          client_name: "Executor",
          redirect_uris: ["http://localhost:4789/api/oauth/callback"],
        });
      })
  );

  it.effect("does not infer native for ambiguous or deceptive redirects", () =>
    Effect.gen(function* () {
      for (const redirect_uris of [
        ["http://192.0.2.1/oauth/callback"],
        ["http://localhost.example.com/oauth/callback"],
        ["http://localhost./oauth/callback"],
        [
          "http://localhost:4789/api/oauth/callback",
          "https://executor.sh/api/oauth/callback",
        ],
      ]) {
        const result = yield* preparePublicOAuthClientRegistration(
          registrationRequest({
            redirect_uris,
            token_endpoint_auth_method: "none",
          })
        );
        expect(result).toBeInstanceOf(Request);
        if (!(result instanceof Request)) continue;
        const body = yield* Effect.promise(() => result.json());
        expect(body).not.toHaveProperty("application_type");
      }
    })
  );

  it.effect("preserves an explicit application type", () =>
    Effect.gen(function* () {
      const result = yield* preparePublicOAuthClientRegistration(
        registrationRequest({
          application_type: "web",
          redirect_uris: ["http://localhost:4789/api/oauth/callback"],
          token_endpoint_auth_method: "none",
        })
      );
      expect(result).toBeInstanceOf(Request);
      if (!(result instanceof Request)) return;
      const body = yield* Effect.promise(() => result.json());
      expect(body).toMatchObject({ application_type: "web" });
    })
  );

  it.effect("leaves standard metadata validation to Better Auth", () =>
    preparePublicOAuthClientRegistration(
      registrationRequest({
        dpop_bound_access_tokens: true,
        jwks_uri: "https://client.test/jwks.json",
        software_statement: "self-asserted",
        subject_type: "public",
        token_endpoint_auth_method: "none",
      })
    ).pipe(
      Effect.tap((result) =>
        Effect.sync(() => expect(result).toBeInstanceOf(Request))
      )
    )
  );

  it.effect("rejects non-public clients", () =>
    Effect.gen(function* () {
      for (const body of [
        {},
        { token_endpoint_auth_method: "private_key_jwt" },
        { token_endpoint_auth_method: "client_secret_basic" },
      ]) {
        const response = yield* preparePublicOAuthClientRegistration(
          registrationRequest(body)
        );
        expect(response).toBeInstanceOf(Response);
        if (response instanceof Response) expect(response.status).toBe(400);
      }
    })
  );

  it.effect("ignores non-registration auth requests", () =>
    Effect.gen(function* () {
      const request = new Request("https://cloudstash.test/api/auth/session");
      const result = yield* preparePublicOAuthClientRegistration(request);
      expect(result).toBe(request);
    })
  );
});
