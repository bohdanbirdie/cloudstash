import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const oxlintMain = require.resolve("oxlint", {
  paths: [dirname(require.resolve("vite-plus"))],
});
const OXLINT_BIN = join(dirname(dirname(oxlintMain)), "bin", "oxlint");

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CONFIG = join(HERE, "oxlintrc.json");
const FIXTURE = join(HERE, "fixtures", "no-chained-type-assertions.ts");

function chainedAssertionViolations(): number {
  try {
    execFileSync("node", [OXLINT_BIN, "-c", CONFIG, FIXTURE], {
      encoding: "utf8",
    });
    return 0;
  } catch (error) {
    const output = (error as { stdout?: string }).stdout?.trim();
    if (!output) return 0;
    return output
      .split("\n")
      .filter((line) => line.includes("anti-slop(no-chained-type-assertions)"))
      .length;
  }
}

describe("anti-slop/no-chained-type-assertions", () => {
  it("flags chained assertions but permits a single boundary assertion", () => {
    expect(chainedAssertionViolations()).toBe(2);
  });
});
