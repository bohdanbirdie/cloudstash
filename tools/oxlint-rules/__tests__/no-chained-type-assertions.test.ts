import { BunServices } from "@effect/platform-bun";
import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";

import { violationsOf } from "./run-oxlint";

layer(BunServices.layer)("anti-slop/no-chained-type-assertions", (it) => {
  it.effect(
    "flags chained assertions but permits a single boundary assertion",
    () =>
      Effect.gen(function* () {
        expect(
          yield* violationsOf(
            "no-chained-type-assertions.ts",
            "no-chained-type-assertions"
          )
        ).toHaveLength(2);
      })
  );
});
