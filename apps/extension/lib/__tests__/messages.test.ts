import { describe, expect, it } from "bun:test";

import { Result } from "effect";

import { decodeExternalMessage, decodeExtMessage } from "../messages";

describe("decodeExtMessage (popup ↔ background)", () => {
  it("accepts cs:get-creds", () => {
    expect(Result.isSuccess(decodeExtMessage({ type: "cs:get-creds" }))).toBe(
      true
    );
  });

  it("accepts cs:open-connect", () => {
    expect(
      Result.isSuccess(decodeExtMessage({ type: "cs:open-connect" }))
    ).toBe(true);
  });

  it("accepts cs:creds-changed with a creds payload", () => {
    const decoded = decodeExtMessage({
      type: "cs:creds-changed",
      creds: { apiKey: "lb_key", orgId: "org_1" },
    });
    expect(Result.isSuccess(decoded)).toBe(true);
  });

  it("accepts cs:creds-changed with null creds (disconnect broadcast)", () => {
    const decoded = decodeExtMessage({
      type: "cs:creds-changed",
      creds: null,
    });
    expect(Result.isSuccess(decoded)).toBe(true);
  });

  // EXT-01-A: the payload used to be two independent nullables, so half a
  // credential decoded successfully and every consumer had to collapse it.
  it("rejects cs:creds-changed carrying only half a credential", () => {
    expect(
      Result.isFailure(
        decodeExtMessage({
          type: "cs:creds-changed",
          creds: { apiKey: "lb_key", orgId: null },
        })
      )
    ).toBe(true);
  });

  it("rejects an unknown message type", () => {
    expect(Result.isFailure(decodeExtMessage({ type: "cs:nope" }))).toBe(true);
  });

  it("rejects a non-object message", () => {
    expect(Result.isFailure(decodeExtMessage("cs:get-creds"))).toBe(true);
  });
});

describe("decodeExternalMessage (web app → background)", () => {
  it("accepts cs:ping", () => {
    expect(Result.isSuccess(decodeExternalMessage({ type: "cs:ping" }))).toBe(
      true
    );
  });

  it("accepts cs:connect with apiKey + orgId", () => {
    const decoded = decodeExternalMessage({
      type: "cs:connect",
      apiKey: "lb_ext_key",
      orgId: "org_1",
    });
    expect(Result.isSuccess(decoded)).toBe(true);
  });

  it("rejects cs:connect missing orgId", () => {
    const decoded = decodeExternalMessage({
      type: "cs:connect",
      apiKey: "lb_ext_key",
    });
    expect(Result.isFailure(decoded)).toBe(true);
  });

  it("does not accept the internal cs:open-connect over the external channel", () => {
    expect(
      Result.isFailure(decodeExternalMessage({ type: "cs:open-connect" }))
    ).toBe(true);
  });

  it("rejects an unknown message type", () => {
    expect(Result.isFailure(decodeExternalMessage({ type: "cs:evil" }))).toBe(
      true
    );
  });
});
