import { BunServices } from "@effect/platform-bun";
import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";

import { violationsOf } from "./run-oxlint";

layer(BunServices.layer)("livestore/pure-materializers", (it) => {
  it.effect(
    "flags clock, randomness and id generators inside materializers only",
    () =>
      Effect.gen(function* () {
        // Date.now and crypto.randomUUID outside materializers, new Date(at)
        // from the payload, and Math.max are ignored.
        expect(
          yield* violationsOf("pure-materializers.ts", "pure-materializers")
        ).toHaveLength(8);
      })
  );
});
