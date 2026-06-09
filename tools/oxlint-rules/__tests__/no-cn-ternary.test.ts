import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
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
const FIXTURE = join(HERE, "fixtures", "no-cn-ternary.tsx");

function runOxlint(args: string[]): string {
  try {
    return execFileSync("node", [OXLINT_BIN, "-c", CONFIG, ...args], {
      encoding: "utf8",
    });
  } catch (error) {
    return (error as { stdout?: string }).stdout ?? "";
  }
}

function ternaryViolations(file: string): number {
  const out = runOxlint(["-f", "json", file]).trim();
  if (!out) return 0;
  const diagnostics = JSON.parse(out).diagnostics as Array<{ code: string }>;
  return diagnostics.filter((d) => d.code.includes("no-cn-ternary")).length;
}

describe("tailwind-cn/no-cn-ternary", () => {
  it("flags only direct cn()/clsx() ternaries with two string-literal branches", () => {
    // 5 violations; the 5 bail-outs below them are ignored
    expect(ternaryViolations(FIXTURE)).toBe(5);
  });

  it("autofixes to object syntax — flips equality, strips !, keeps bail-outs", () => {
    const target = join(mkdtempSync(join(tmpdir(), "cn-ternary-")), "case.tsx");
    copyFileSync(FIXTURE, target);
    runOxlint(["--fix", target]);
    const fixed = readFileSync(target, "utf8");

    expect(fixed).toContain('{ "a": inverted, "b": !inverted }');
    expect(fixed).toContain('{ "a": plan.inverted, "b": !plan.inverted }');
    expect(fixed).toContain('{ "a": flag === "x", "b": flag !== "x" }');
    expect(fixed).toContain('{ "a": !inverted, "b": inverted }');

    expect(fixed).toContain('cn("base", inverted && "a")');
    expect(fixed).toContain('className={inverted ? "a" : "b"}');
    expect(fixed).toContain('inverted ? "a" : ""');
    expect(fixed).toContain("inverted ? styles.a");

    expect(ternaryViolations(target)).toBe(0);
  });
});
