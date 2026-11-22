import { describe, expect, it } from "vitest";

import { isNativeSignInToken, nativeSignInLink } from "../native-sign-in";

describe("isNativeSignInToken", () => {
  it("accepts a 43-character base64url value", () => {
    expect(isNativeSignInToken("A".repeat(43))).toBe(true);
    expect(isNativeSignInToken(`${"a-_9".repeat(10)}abc`)).toBe(true);
  });

  it("rejects missing values, other lengths, and other alphabets", () => {
    expect(isNativeSignInToken(null)).toBe(false);
    expect(isNativeSignInToken("")).toBe(false);
    expect(isNativeSignInToken("A".repeat(42))).toBe(false);
    expect(isNativeSignInToken("A".repeat(44))).toBe(false);
    expect(isNativeSignInToken(`${"A".repeat(42)}=`)).toBe(false);
    expect(isNativeSignInToken(`${"A".repeat(42)}&`)).toBe(false);
  });
});

describe("nativeSignInLink", () => {
  it("builds the app's callback link with the code and state", () => {
    const link = new URL(nativeSignInLink("code-1", "state-1"));
    expect(link.protocol).toBe("cloudstash:");
    expect(link.host).toBe("auth");
    expect(link.pathname).toBe("/callback");
    expect(link.searchParams.get("code")).toBe("code-1");
    expect(link.searchParams.get("state")).toBe("state-1");
  });
});
