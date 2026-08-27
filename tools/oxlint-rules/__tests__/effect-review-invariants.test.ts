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
const FIXTURE = join(HERE, "fixtures", "effect-review-invariants.ts");

function violationsByRule(): Map<string, number> {
  let output = "";
  try {
    execFileSync("node", [OXLINT_BIN, "-c", CONFIG, FIXTURE], {
      encoding: "utf8",
    });
  } catch (error) {
    output = (error as { stdout?: string }).stdout ?? "";
  }

  const counts = new Map<string, number>();
  for (const rule of [
    "no-hidden-app-layer-outputs",
    "no-capability-recovery-after-span",
  ]) {
    counts.set(
      rule,
      output.split("\n").filter((line) => line.includes(`anti-slop(${rule})`))
        .length
    );
  }
  return counts;
}

describe("Effect review invariants", () => {
  it("preserves AppLayerLive outputs and expected-denial span semantics", () => {
    const violations = violationsByRule();
    expect(violations.get("no-hidden-app-layer-outputs")).toBe(1);
    expect(violations.get("no-capability-recovery-after-span")).toBe(2);
  });
});
