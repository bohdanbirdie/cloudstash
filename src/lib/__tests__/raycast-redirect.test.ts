import { describe, expect, it } from "vitest";

import { isAllowedRedirectUri } from "../raycast-redirect";

describe("isAllowedRedirectUri", () => {
  it("accepts the canonical Raycast redirect origin", () => {
    expect(
      isAllowedRedirectUri("https://raycast.com/redirect?packageName=Extension")
    ).toBe(true);
    expect(isAllowedRedirectUri("https://raycast.com/redirect/extension")).toBe(
      true
    );
  });

  it("rejects null, empty, and malformed inputs", () => {
    expect(isAllowedRedirectUri(null)).toBe(false);
    expect(isAllowedRedirectUri("")).toBe(false);
    expect(isAllowedRedirectUri("not a url")).toBe(false);
    expect(isAllowedRedirectUri("//raycast.com/x")).toBe(false);
  });

  it("rejects different origins, subdomains, and lookalikes", () => {
    expect(isAllowedRedirectUri("https://evil.com/r")).toBe(false);
    expect(isAllowedRedirectUri("https://raycast.com.evil.com/r")).toBe(false);
    expect(isAllowedRedirectUri("https://evil.raycast.com/r")).toBe(false);
    expect(isAllowedRedirectUri("http://raycast.com/r")).toBe(false);
    expect(isAllowedRedirectUri("https://raycast.com:8443/r")).toBe(false);
  });

  it("rejects dangerous URL schemes", () => {
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirectUri("data:text/html,<script>")).toBe(false);
    expect(isAllowedRedirectUri("file:///etc/passwd?host=raycast.com")).toBe(
      false
    );
  });

  it("ignores query-string spoof attempts", () => {
    expect(
      isAllowedRedirectUri("https://evil.com/?redirect=https://raycast.com")
    ).toBe(false);
    expect(isAllowedRedirectUri("https://evil.com#https://raycast.com")).toBe(
      false
    );
  });
});
