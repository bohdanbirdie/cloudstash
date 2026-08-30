import { describe, expect, it } from "vitest";

import { fixture, violationsOf } from "./run-oxlint";

describe("motion/no-use-reduced-motion", () => {
  it("flags useReducedMotion imported from motion/react and framer-motion", () => {
    // MotionConfig, motion, and a same-named import from a non-motion module
    // are ignored.
    expect(
      violationsOf(
        fixture("no-use-reduced-motion.tsx"),
        "no-use-reduced-motion"
      )
    ).toHaveLength(2);
  });
});
