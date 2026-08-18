import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const installedAgentsSource = readFileSync(
  new URL(
    "../../../../node_modules/agents/dist/cloudflare-BduZwmYK.js",
    import.meta.url
  ),
  "utf8"
);

describe("Agents SDK tracing compatibility patch", () => {
  it("uses native tracing only when startActiveSpan is available", () => {
    expect(installedAgentsSource).toContain(
      'typeof runtimeTracing?.startActiveSpan === "function" ? runtimeTracing :'
    );
    expect(installedAgentsSource).toContain(
      "startActiveSpan(_name, run) {\n\treturn run(noopSpan);"
    );
  });
});
