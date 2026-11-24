import { BunServices } from "@effect/platform-bun";
import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";

import { violationsOf } from "./run-oxlint";

layer(BunServices.layer)("motion/no-use-reduced-motion", (it) => {
  it.effect(
    "flags useReducedMotion imported from motion/react and framer-motion",
    () =>
      Effect.gen(function* () {
        // MotionConfig, motion, and a same-named import from a non-motion module
        // are ignored.
        expect(
          yield* violationsOf(
            "no-use-reduced-motion.tsx",
            "no-use-reduced-motion"
          )
        ).toHaveLength(2);
      })
  );
});
