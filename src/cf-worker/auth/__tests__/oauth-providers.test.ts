import { describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { expect, vi } from "vitest";

import {
  XUserInfoError,
  getXUserInfo,
  oauthProvidersPlugin,
} from "../oauth-providers";

const providerIds = (
  xCredentials: { X_CLIENT_ID?: string; X_CLIENT_SECRET?: string } = {}
) =>
  oauthProvidersPlugin({
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "google-secret",
    ...xCredentials,
  }).options.config.map(({ providerId }) => providerId);

const googleProvider = () =>
  oauthProvidersPlugin({
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "google-secret",
  }).options.config[0];

const withFetch = (response: Response | Error) => {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response)
  );
  return {
    fetch,
    run: (accessToken?: string) =>
      getXUserInfo(accessToken).pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.provideService(FetchHttpClient.Fetch, fetch)
      ),
  };
};

describe("OAuth provider registration", () => {
  it("uses fixed Google endpoints without startup discovery", () => {
    expect(googleProvider()).toMatchObject({
      accountIssuer: "https://accounts.google.com",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    });
    expect(googleProvider()).not.toHaveProperty("discoveryUrl");
  });

  it.each([
    ["absent X credentials", {}],
    ["only an X client ID", { X_CLIENT_ID: "x-client" }],
    ["only an X client secret", { X_CLIENT_SECRET: "x-secret" }],
    ["an empty X client ID", { X_CLIENT_ID: "", X_CLIENT_SECRET: "x-secret" }],
    [
      "an empty X client secret",
      { X_CLIENT_ID: "x-client", X_CLIENT_SECRET: "" },
    ],
  ])("omits X with %s", (_label, xCredentials) => {
    expect(providerIds(xCredentials)).toEqual(["google"]);
  });

  it("registers X with complete credentials", () => {
    expect(
      providerIds({
        X_CLIENT_ID: "x-client",
        X_CLIENT_SECRET: "x-secret",
      })
    ).toEqual(["google", "x"]);
  });

  it.effect("decodes X user info through the Effect HTTP client", () =>
    Effect.gen(function* () {
      const test = withFetch(
        Response.json({
          data: {
            id: "x-user",
            name: "Cloud Stasher",
            profile_image_url: "https://example.com/avatar.png",
            username: "stasher",
          },
        })
      );
      const user = yield* test.run("x-token");

      expect(user).toMatchObject({
        id: "x-user",
        email: "stasher@x.local",
        image: "https://example.com/avatar.png",
      });
      expect(test.fetch).toHaveBeenCalledOnce();
      expect(test.fetch.mock.calls[0]?.[1]?.headers).toMatchObject({
        authorization: "Bearer x-token",
      });
    })
  );

  for (const [name, accessToken, response] of [
    ["a missing token", undefined, Response.json({})],
    ["a transport failure", "x-token", new Error("offline")],
    ["a rejected response", "x-token", new Response(null, { status: 401 })],
    ["invalid JSON", "x-token", new Response("not-json")],
    ["an invalid payload", "x-token", Response.json({ data: {} })],
  ] as const) {
    it.effect(`rejects ${name}`, () =>
      Effect.gen(function* () {
        const failure = yield* withFetch(response)
          .run(accessToken)
          .pipe(Effect.flip);
        expect(failure).toBeInstanceOf(XUserInfoError);
      })
    );
  }
});
