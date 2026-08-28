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
const FIXTURE = join(HERE, "fixtures", "enforce-cn.tsx");

function runOxlint(args: string[]): string {
  try {
    return execFileSync("node", [OXLINT_BIN, "-c", CONFIG, ...args], {
      encoding: "utf8",
    });
  } catch (error) {
    return (error as { stdout?: string }).stdout ?? "";
  }
}

function violations(file: string): Array<{ message: string }> {
  const out = runOxlint(["-f", "json", file]).trim();
  if (!out) return [];
  const diagnostics = JSON.parse(out).diagnostics as Array<{
    code: string;
    message: string;
  }>;
  return diagnostics.filter((diagnostic) =>
    diagnostic.code.includes("enforce-cn")
  );
}

describe("tailwind-cn/enforce-cn", () => {
  it("rejects direct className construction and conditional cn arguments", () => {
    const diagnostics = violations(FIXTURE);

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
  });
});
