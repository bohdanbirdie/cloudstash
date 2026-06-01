import { describe, expect, it } from "bun:test";

import { Either } from "effect";

import { decodeExternalMessage, decodeExtMessage } from "../messages";

describe("decodeExtMessage (popup ↔ background)", () => {
  it("accepts cs:get-creds", () => {
    expect(Either.isRight(decodeExtMessage({ type: "cs:get-creds" }))).toBe(
      true
    );
  });

  it("accepts cs:open-connect", () => {
    expect(Either.isRight(decodeExtMessage({ type: "cs:open-connect" }))).toBe(
      true
    );
  });

  it("accepts cs:creds-changed with a creds payload", () => {
    const decoded = decodeExtMessage({
      type: "cs:creds-changed",
      creds: { apiKey: "lb_key", orgId: "org_1" },
    });
    expect(Either.isRight(decoded)).toBe(true);
  });

  it("accepts cs:creds-changed with null creds (disconnect broadcast)", () => {
    const decoded = decodeExtMessage({
      type: "cs:creds-changed",
      creds: { apiKey: null, orgId: null },
    });
    expect(Either.isRight(decoded)).toBe(true);
  });

  it("rejects an unknown message type", () => {
    expect(Either.isLeft(decodeExtMessage({ type: "cs:nope" }))).toBe(true);
  });

  it("rejects a non-object message", () => {
    expect(Either.isLeft(decodeExtMessage("cs:get-creds"))).toBe(true);
  });
});

describe("decodeExternalMessage (web app → background)", () => {
  it("accepts cs:ping", () => {
    expect(Either.isRight(decodeExternalMessage({ type: "cs:ping" }))).toBe(
      true
    );
  });

  it("accepts cs:connect with apiKey + orgId", () => {
    const decoded = decodeExternalMessage({
      type: "cs:connect",
      apiKey: "lb_ext_key",
      orgId: "org_1",
    });
    expect(Either.isRight(decoded)).toBe(true);
  });

  it("rejects cs:connect missing orgId", () => {
    const decoded = decodeExternalMessage({
      type: "cs:connect",
      apiKey: "lb_ext_key",
    });
    expect(Either.isLeft(decoded)).toBe(true);
  });

  it("does not accept the internal cs:open-connect over the external channel", () => {
    expect(
      Either.isLeft(decodeExternalMessage({ type: "cs:open-connect" }))
    ).toBe(true);
  });

  it("rejects an unknown message type", () => {
    expect(Either.isLeft(decodeExternalMessage({ type: "cs:evil" }))).toBe(
      true
    );
  });
});
