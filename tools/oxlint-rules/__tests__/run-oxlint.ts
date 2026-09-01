import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const oxlintMain = require.resolve("oxlint", {
  paths: [dirname(require.resolve("vite-plus"))],
});

const OXLINT_BIN = join(dirname(dirname(oxlintMain)), "bin", "oxlint");
const HERE = fileURLToPath(new URL(".", import.meta.url));
const CONFIG = join(HERE, "oxlintrc.json");

export interface Diagnostic {
  readonly code: string;
  readonly message: string;
}

/** Absolute path to a file under `__tests__/fixtures`. */
export const fixture = (name: string): string => join(HERE, "fixtures", name);

/**
 * Lint one fixture and return its diagnostics. Reads the structured reporter
 * rather than grepping human-readable output, so a change to oxlint's default
 * format cannot silently turn a rule test green.
 */
export const lintFixture = (file: string): Diagnostic[] => {
  let out: string;
  try {
    out = execFileSync("node", [OXLINT_BIN, "-c", CONFIG, "-f", "json", file], {
      encoding: "utf8",
    });
  } catch (error) {
    out = (error as { stdout?: string }).stdout ?? "";
  }

  const trimmed = out.trim();
  if (!trimmed) return [];
  return (JSON.parse(trimmed) as { diagnostics: Diagnostic[] }).diagnostics;
};

/** Diagnostics for one rule, e.g. `anti-slop(no-test-spies)`. */
export const violationsOf = (file: string, rule: string): Diagnostic[] =>
  lintFixture(file).filter((d) => d.code.includes(rule));
