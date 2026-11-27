import { describe, expect, it } from "vitest";

import { googleEmulatorURL, localCookiePrefix } from "../local-dev";

describe("local dev auth", () => {
  it.each([
    ["http://127.0.0.1:3000", "cloudstash-3000"],
    ["http://localhost:4123", "cloudstash-4123"],
    ["http://localhost", undefined],
    ["https://cloudstash.dev", undefined],
    ["https://staging.cloudstash.dev:8443", undefined],
  ])("names %s cookies %s", (baseURL, prefix) => {
    expect(localCookiePrefix(baseURL)).toBe(prefix);
  });

  it("uses the emulator only between loopback addresses", () => {
    expect(
      googleEmulatorURL({
        BETTER_AUTH_URL: "http://127.0.0.1:3000",
        GOOGLE_EMULATOR_URL: "http://localhost:4100/",
      })
    ).toBe("http://localhost:4100");
    expect(
      googleEmulatorURL({
        BETTER_AUTH_URL: "https://cloudstash.dev",
        GOOGLE_EMULATOR_URL: "http://localhost:4100",
      })
    ).toBeUndefined();
    expect(
      googleEmulatorURL({ BETTER_AUTH_URL: "http://127.0.0.1:3000" })
    ).toBeUndefined();
  });
});
