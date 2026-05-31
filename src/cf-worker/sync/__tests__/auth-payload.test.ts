import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import { decodeApiKeyMetadata, decodeExtensionPayload } from "../auth-payload";

describe("decodeExtensionPayload", () => {
  it("accepts a valid apiKey payload", () => {
    const result = decodeExtensionPayload({ apiKey: "lb_test_123" });
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.apiKey).toBe("lb_test_123");
    }
  });

  it("rejects an undefined payload", () => {
    expect(Option.isNone(decodeExtensionPayload(undefined))).toBe(true);
  });

  it("rejects a payload missing apiKey", () => {
    expect(Option.isNone(decodeExtensionPayload({}))).toBe(true);
  });

  it("rejects a payload with wrong apiKey type", () => {
    expect(Option.isNone(decodeExtensionPayload({ apiKey: 42 }))).toBe(true);
  });

  it("rejects a string payload", () => {
    expect(Option.isNone(decodeExtensionPayload("lb_test"))).toBe(true);
  });
});

describe("decodeApiKeyMetadata", () => {
  it("accepts metadata with orgId", () => {
    const result = decodeApiKeyMetadata({ orgId: "org-1" });
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.orgId).toBe("org-1");
    }
  });

  it("accepts metadata with orgId plus extra fields", () => {
    const result = decodeApiKeyMetadata({
      orgId: "org-1",
      source: "chrome-extension",
    });
    expect(Option.isSome(result)).toBe(true);
  });

  it("rejects null metadata", () => {
    expect(Option.isNone(decodeApiKeyMetadata(null))).toBe(true);
  });

  it("rejects metadata missing orgId", () => {
    expect(Option.isNone(decodeApiKeyMetadata({ source: "raycast" }))).toBe(
      true
    );
  });

  it("rejects metadata with wrong orgId type", () => {
    expect(Option.isNone(decodeApiKeyMetadata({ orgId: 1 }))).toBe(true);
  });
});
