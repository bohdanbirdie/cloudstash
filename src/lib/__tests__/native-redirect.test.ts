import { describe, expect, it } from "vitest";

import {
  isAllowedNativeRedirectUri,
  isNativeCodeChallenge,
} from "../native-redirect";

describe("isAllowedNativeRedirectUri", () => {
  it("accepts the loopback callback on any port", () => {
    expect(isAllowedNativeRedirectUri("http://127.0.0.1:53127/callback")).toBe(
      true
    );
    expect(isAllowedNativeRedirectUri("http://127.0.0.1:8080/callback")).toBe(
      true
    );
  });

  it("rejects null, empty, and malformed inputs", () => {
    expect(isAllowedNativeRedirectUri(null)).toBe(false);
    expect(isAllowedNativeRedirectUri("")).toBe(false);
    expect(isAllowedNativeRedirectUri("not a url")).toBe(false);
  });

  it("rejects other hosts, schemes, and lookalikes", () => {
    expect(isAllowedNativeRedirectUri("https://127.0.0.1:53127/callback")).toBe(
      false
    );
    expect(isAllowedNativeRedirectUri("http://localhost:53127/callback")).toBe(
      false
    );
    expect(isAllowedNativeRedirectUri("http://evil.com:53127/callback")).toBe(
      false
    );
    expect(
      isAllowedNativeRedirectUri("http://127.0.0.1.evil.com:53127/callback")
    ).toBe(false);
    expect(
      isAllowedNativeRedirectUri("http://127.0.0.1:53127@evil.com/callback")
    ).toBe(false);
    expect(
      isAllowedNativeRedirectUri("http://user@127.0.0.1:53127/callback")
    ).toBe(false);
    expect(isAllowedNativeRedirectUri("javascript:alert(1)")).toBe(false);
  });

  it("rejects a missing port, another path, a query, or a fragment", () => {
    expect(isAllowedNativeRedirectUri("http://127.0.0.1/callback")).toBe(false);
    expect(isAllowedNativeRedirectUri("http://127.0.0.1:53127/other")).toBe(
      false
    );
    expect(
      isAllowedNativeRedirectUri("http://127.0.0.1:53127/callback?next=x")
    ).toBe(false);
    expect(
      isAllowedNativeRedirectUri("http://127.0.0.1:53127/callback#x")
    ).toBe(false);
  });
});

describe("isNativeCodeChallenge", () => {
  it("accepts a 43-character base64url value", () => {
    expect(isNativeCodeChallenge("A".repeat(43))).toBe(true);
    expect(isNativeCodeChallenge(`${"a-_9".repeat(10)}abc`)).toBe(true);
  });

  it("rejects other lengths and alphabets", () => {
    expect(isNativeCodeChallenge(null)).toBe(false);
    expect(isNativeCodeChallenge("A".repeat(42))).toBe(false);
    expect(isNativeCodeChallenge("A".repeat(44))).toBe(false);
    expect(isNativeCodeChallenge(`${"A".repeat(42)}=`)).toBe(false);
    expect(isNativeCodeChallenge(`${"A".repeat(42)}:`)).toBe(false);
  });
});
