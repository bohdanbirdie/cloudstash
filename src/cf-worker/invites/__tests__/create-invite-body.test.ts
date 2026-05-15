import { Effect, Either, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { CreateInviteBody, MAX_EXPIRES_IN_DAYS } from "../service";

const decode = (input: unknown) =>
  Effect.runSync(Effect.either(Schema.decodeUnknown(CreateInviteBody)(input)));

describe("CreateInviteBody schema", () => {
  it("accepts an empty body", () => {
    const result = decode({});
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result))
      expect(result.right.expiresInDays).toBeUndefined();
  });

  it("accepts a positive integer in range", () => {
    const result = decode({ expiresInDays: 30 });
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) expect(result.right.expiresInDays).toBe(30);
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
    expect(Either.isLeft(decode({ expiresInDays: value }))).toBe(true);
  });

  it("accepts the upper bound", () => {
    const result = decode({ expiresInDays: MAX_EXPIRES_IN_DAYS });
    expect(Either.isRight(result)).toBe(true);
  });
});
