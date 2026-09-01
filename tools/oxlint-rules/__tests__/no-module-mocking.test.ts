import { describe, expect, it } from "vitest";

import { fixture, violationsOf } from "./run-oxlint";

describe("anti-slop/no-module-mocking", () => {
  it("flags framework module mocks without flagging unrelated or shadowed methods", () => {
    expect(
      violationsOf(fixture("no-module-mocking.ts"), "no-module-mocking")
    ).toHaveLength(4);
  });
});
