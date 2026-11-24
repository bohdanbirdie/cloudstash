import { BunServices } from "@effect/platform-bun";
import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";

import { violationsOf } from "./run-oxlint";

const FIXTURE = "effect-review-invariants.ts";

layer(BunServices.layer)("Effect review invariants", (it) => {
  it.effect(
    "preserves AppLayerLive outputs and expected-denial span semantics",
    () =>
      Effect.gen(function* () {
        expect(
          yield* violationsOf(FIXTURE, "no-hidden-app-layer-outputs")
        ).toHaveLength(1);
        expect(
          yield* violationsOf(FIXTURE, "no-capability-recovery-after-span")
        ).toHaveLength(2);
      })
  );
});
