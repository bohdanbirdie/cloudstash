import { describe, expect, it } from "@effect/vitest";

import {
  digestEventSinkErrorFromUnknown,
  digestLinkSourceErrorFromUnknown,
  weeklyDigestGenerateErrorFromAiSdk,
} from "../errors";

const CTX = { linkCount: 3, model: "test-model" };

describe("weeklyDigestGenerateErrorFromAiSdk", () => {
  it("extracts statusCode from AI SDK shape", () => {
    const e = weeklyDigestGenerateErrorFromAiSdk(CTX)({
      message: "rate limited",
      statusCode: 429,
    });
    expect(e._tag).toBe("WeeklyDigestGenerateError");
    expect(e.message).toBe("rate limited");
    expect(e.statusCode).toBe(429);
    expect(e.model).toBe("test-model");
    expect(e.linkCount).toBe(3);
  });

  it("falls back to lastError.statusCode when top-level statusCode is missing", () => {
    const e = weeklyDigestGenerateErrorFromAiSdk(CTX)({
      lastError: { statusCode: 503 },
      message: "upstream down",
    });
    expect(e.statusCode).toBe(503);
    expect(e.message).toBe("upstream down");
  });

  it("yields undefined statusCode when neither is present", () => {
    const e = weeklyDigestGenerateErrorFromAiSdk(CTX)({ message: "weird" });
    expect(e.statusCode).toBeUndefined();
    expect(e.message).toBe("weird");
  });

  it("handles non-object causes via String()", () => {
    const e = weeklyDigestGenerateErrorFromAiSdk(CTX)("boom");
    expect(e.message).toBe("boom");
    expect(e.statusCode).toBeUndefined();
  });

  it("handles null cause", () => {
    const e = weeklyDigestGenerateErrorFromAiSdk(CTX)(null);
    expect(e.message).toBe("null");
    expect(e.statusCode).toBeUndefined();
  });

  it("preserves the original cause", () => {
    const raw = { message: "x", statusCode: 500 };
    const e = weeklyDigestGenerateErrorFromAiSdk(CTX)(raw);
    expect(e.cause).toBe(raw);
  });
});

describe("digestLinkSourceErrorFromUnknown", () => {
  it("uses Error.message when cause is an Error", () => {
    const e = digestLinkSourceErrorFromUnknown(new Error("db gone"));
    expect(e._tag).toBe("DigestLinkSourceError");
    expect(e.message).toBe("db gone");
    expect(e.operation).toBe("collect");
  });

  it("falls back to String() for non-Error causes", () => {
    const e = digestLinkSourceErrorFromUnknown(42);
    expect(e.message).toBe("42");
  });

  it("preserves the cause", () => {
    const raw = new Error("x");
    const e = digestLinkSourceErrorFromUnknown(raw);
    expect(e.cause).toBe(raw);
  });
});

describe("digestEventSinkErrorFromUnknown", () => {
  it("uses Error.message when cause is an Error", () => {
    const e = digestEventSinkErrorFromUnknown(new Error("commit failed"));
    expect(e._tag).toBe("DigestEventSinkError");
    expect(e.message).toBe("commit failed");
    expect(e.operation).toBe("commit");
  });

  it("falls back to String() for non-Error causes", () => {
    const e = digestEventSinkErrorFromUnknown(undefined);
    expect(e.message).toBe("undefined");
  });
});
