import { describe, expect, it } from "vitest";

import { oauthProvidersPlugin } from "..";

const providerIds = (
  xCredentials: { X_CLIENT_ID?: string; X_CLIENT_SECRET?: string } = {}
) =>
  oauthProvidersPlugin({
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "google-secret",
    ...xCredentials,
  }).options.config.map(({ providerId }) => providerId);

const googleProvider = (GOOGLE_BASE_URL?: string) =>
  oauthProvidersPlugin({
    GOOGLE_BASE_URL,
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "google-secret",
  }).options.config[0];

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

  it("derives fixed emulator endpoints from GOOGLE_BASE_URL", () => {
    expect(googleProvider("http://localhost:4000/")).toMatchObject({
      accountIssuer: "http://localhost:4000",
      authorizationUrl: "http://localhost:4000/o/oauth2/v2/auth",
      tokenUrl: "http://localhost:4000/oauth2/token",
      userInfoUrl: "http://localhost:4000/oauth2/v2/userinfo",
    });
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
});
