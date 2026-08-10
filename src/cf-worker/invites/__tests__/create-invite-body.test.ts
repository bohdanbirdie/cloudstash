import { Effect, Result, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { CreateInviteBody, MAX_EXPIRES_IN_DAYS } from "../service";

const decode = (input: unknown) =>
  Effect.runSync(
    Effect.result(Schema.decodeUnknownEffect(CreateInviteBody)(input))
  );

describe("CreateInviteBody schema", () => {
  it("accepts an empty body", () => {
    const result = decode({});
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result))
      expect(result.success.expiresInDays).toBeUndefined();
  });

  it("accepts a positive integer in range", () => {
    const result = decode({ expiresInDays: 30 });
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) expect(result.success.expiresInDays).toBe(30);
  });

  it.each([
    ["zero", 0],
    ["negative", -5],
    ["fractional", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["above limit", MAX_EXPIRES_IN_DAYS + 1],
    ["string", "30"],
    ["null", null],
    ["true", true],
  ])("rejects %s", (_label, value) => {
    expect(Result.isFailure(decode({ expiresInDays: value }))).toBe(true);
  });

  it("accepts the upper bound", () => {
    const result = decode({ expiresInDays: MAX_EXPIRES_IN_DAYS });
    expect(Result.isSuccess(result)).toBe(true);
  });
});
