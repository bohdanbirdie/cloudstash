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

describe("OAuth provider registration", () => {
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
