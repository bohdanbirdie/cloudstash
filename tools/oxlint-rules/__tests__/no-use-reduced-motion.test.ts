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
const FIXTURE = join(HERE, "fixtures", "no-use-reduced-motion.tsx");

function runOxlint(args: string[]): string {
  try {
    return execFileSync("node", [OXLINT_BIN, "-c", CONFIG, ...args], {
      encoding: "utf8",
    });
  } catch (error) {
    return (error as { stdout?: string }).stdout ?? "";
  }
}

function reducedMotionViolations(file: string): number {
  const out = runOxlint(["-f", "json", file]).trim();
  if (!out) return 0;
  const diagnostics = JSON.parse(out).diagnostics as Array<{ code: string }>;
  return diagnostics.filter((d) => d.code.includes("no-use-reduced-motion"))
    .length;
}

describe("motion/no-use-reduced-motion", () => {
  it("flags useReducedMotion imported from motion/react and framer-motion", () => {
    // 2 violations (motion/react + framer-motion); MotionConfig, motion, and a
    // same-named import from a non-motion module are ignored.
    expect(reducedMotionViolations(FIXTURE)).toBe(2);
  });
});
