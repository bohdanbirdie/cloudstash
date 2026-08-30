import { describe, expect, it } from "vitest";

import { fixture, violationsOf } from "./run-oxlint";

const FIXTURE = fixture("effect-review-invariants.ts");

describe("Effect review invariants", () => {
  it("preserves AppLayerLive outputs and expected-denial span semantics", () => {
    expect(violationsOf(FIXTURE, "no-hidden-app-layer-outputs")).toHaveLength(
      1
    );
    expect(
      violationsOf(FIXTURE, "no-capability-recovery-after-span")
    ).toHaveLength(2);
  });
});
