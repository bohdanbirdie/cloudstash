import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import { bearerApiKey } from "../bearer-api-key";

describe("bearerApiKey", () => {
  it.each([
    ["Bearer key-1", "key-1"],
    ["bearer key-1", "key-1"],
    ["Bearer   key-1", "key-1"],
    [null, null],
    ["Basic key-1", null],
    ["Bearer", null],
    ["Bearer ", null],
    ["Bearer key-1 extra", null],
    ["Bearer key-1 ", "key-1"],
  ])("decodes %s as %s", (authorization, expected) => {
    const headers = new Headers();
    if (authorization !== null) headers.set("authorization", authorization);

    expect(Option.getOrNull(bearerApiKey(headers))).toBe(expected);
  });
});
