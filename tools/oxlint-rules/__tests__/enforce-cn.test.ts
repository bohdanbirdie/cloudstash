import { BunServices } from "@effect/platform-bun";
import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";

import { violationsOf } from "./run-oxlint";

layer(BunServices.layer)("tailwind-cn/enforce-cn", (it) => {
  it.effect(
    "rejects direct className construction and conditional cn arguments",
    () =>
      Effect.gen(function* () {
        const diagnostics = yield* violationsOf("enforce-cn.tsx", "enforce-cn");

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
      })
  );
});
