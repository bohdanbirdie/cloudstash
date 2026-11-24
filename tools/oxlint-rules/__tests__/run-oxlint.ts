import { createRequire } from "node:module";

import { Effect, Path, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const Diagnostic = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
});
export type Diagnostic = typeof Diagnostic.Type;

const OxlintReport = Schema.fromJsonString(
  Schema.Struct({ diagnostics: Schema.Array(Diagnostic) })
);

const require = createRequire(import.meta.url);

/**
 * Lint one fixture under `__tests__/fixtures` and return its diagnostics.
 * Reads the structured reporter rather than grepping human-readable output,
 * so a change to oxlint's default format cannot silently turn a rule test
 * green.
 */
export const lintFixture = Effect.fn("lintFixture")(function* (name: string) {
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const here = yield* path.fromFileUrl(new URL(".", import.meta.url));
  const oxlintMain = require.resolve("oxlint", {
    paths: [path.dirname(require.resolve("vite-plus"))],
  });
  const oxlintBin = path.join(
    path.dirname(path.dirname(oxlintMain)),
    "bin",
    "oxlint"
  );
  const out = yield* spawner.string(
    ChildProcess.make(process.execPath, [
      oxlintBin,
      "-c",
      path.join(here, "oxlintrc.json"),
      "-f",
      "json",
      path.join(here, "fixtures", name),
    ])
  );

  const trimmed = out.trim();
  if (!trimmed) return [];
  return (yield* Schema.decodeEffect(OxlintReport)(trimmed)).diagnostics;
});

/** Diagnostics for one rule, e.g. `anti-slop(no-test-spies)`. */
export const violationsOf = (name: string, rule: string) =>
  lintFixture(name).pipe(
    Effect.map((diagnostics) =>
      diagnostics.filter((diagnostic) => diagnostic.code.includes(rule))
    )
  );
