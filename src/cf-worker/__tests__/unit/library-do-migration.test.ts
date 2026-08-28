import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const wranglerConfig = readFileSync(
  new URL("../../../../wrangler.jsonc", import.meta.url),
  "utf8"
);
const workerEntry = readFileSync(
  new URL("../../index.ts", import.meta.url),
  "utf8"
);
const occurrenceCount = (pattern: RegExp): number =>
  wranglerConfig.match(pattern)?.length ?? 0;

describe("LibraryDO migration", () => {
  it("keeps the old namespace live during the alias-first deployment", () => {
    expect(
      occurrenceCount(
        /"name":\s*"LIBRARY_DO",\s*"class_name":\s*"LinkProcessorDO"/g
      )
    ).toBe(2);
    expect(workerEntry).toContain(
      'export { LibraryDO, LibraryDO as LinkProcessorDO } from "./link-processor";'
    );
    expect(wranglerConfig).not.toMatch(/"renamed_classes"/);
    expect(wranglerConfig).not.toMatch(/"tag":\s*"v5"/);
    expect(wranglerConfig).not.toMatch(
      /"new_sqlite_classes"\s*:\s*\[[^\]]*"LibraryDO"/
    );
  });
});
