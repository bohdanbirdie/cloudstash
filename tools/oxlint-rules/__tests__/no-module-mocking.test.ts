import { BunServices } from "@effect/platform-bun";
import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";

import { violationsOf } from "./run-oxlint";

layer(BunServices.layer)("anti-slop/no-module-mocking", (it) => {
  it.effect(
    "flags framework module mocks without flagging unrelated or shadowed methods",
    () =>
      Effect.gen(function* () {
        expect(
          yield* violationsOf("no-module-mocking.ts", "no-module-mocking")
        ).toHaveLength(4);
      })
  );
});
