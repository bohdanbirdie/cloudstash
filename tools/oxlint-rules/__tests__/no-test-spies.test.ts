import { describe, expect, it } from "vitest";

import { fixture, violationsOf } from "./run-oxlint";

describe("anti-slop/no-test-spies", () => {
  it("flags framework spies without flagging unrelated or shadowed methods", () => {
    expect(
      violationsOf(fixture("no-test-spies.ts"), "no-test-spies")
    ).toHaveLength(3);
  });
});
