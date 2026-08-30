import { describe, expect, it } from "vitest";

import { fixture, violationsOf } from "./run-oxlint";

describe("tailwind-cn/enforce-cn", () => {
  it("rejects direct className construction and conditional cn arguments", () => {
    const diagnostics = violationsOf(fixture("enforce-cn.tsx"), "enforce-cn");

    expect(diagnostics).toHaveLength(9);
    expect(
      diagnostics.filter((diagnostic) =>
        diagnostic.message.startsWith("Pass class values")
      )
    ).toHaveLength(4);
    expect(
      diagnostics.filter((diagnostic) =>
        diagnostic.message.startsWith("Use cn() object syntax")
      )
    ).toHaveLength(5);
  });
});
