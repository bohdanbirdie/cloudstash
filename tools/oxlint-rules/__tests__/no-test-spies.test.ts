import { BunServices } from "@effect/platform-bun";
import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";

import { violationsOf } from "./run-oxlint";

layer(BunServices.layer)("anti-slop/no-test-spies", (it) => {
  it.effect(
    "flags framework spies without flagging unrelated or shadowed methods",
    () =>
      Effect.gen(function* () {
        expect(
          yield* violationsOf("no-test-spies.ts", "no-test-spies")
        ).toHaveLength(3);
      })
  );
});
