import { describe, expect, it } from "vitest";

import { fixture, violationsOf } from "./run-oxlint";

describe("anti-slop/no-chained-type-assertions", () => {
  it("flags chained assertions but permits a single boundary assertion", () => {
    expect(
      violationsOf(
        fixture("no-chained-type-assertions.ts"),
        "no-chained-type-assertions"
      )
    ).toHaveLength(2);
  });
});
