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
const libraryDoSource = readFileSync(
  new URL("../../link-processor/durable-object.ts", import.meta.url),
  "utf8"
);
const occurrenceCount = (pattern: RegExp): number =>
  wranglerConfig.match(pattern)?.length ?? 0;

describe("LibraryDO migration", () => {
  it("renames the namespace while preserving LiveStore's binding identity", () => {
    expect(
      occurrenceCount(/"name":\s*"LIBRARY_DO",\s*"class_name":\s*"LibraryDO"/g)
    ).toBe(2);
    expect(
      occurrenceCount(
        /"name":\s*"LINK_PROCESSOR_DO",\s*"class_name":\s*"LibraryDO"/g
      )
    ).toBe(2);
    expect(workerEntry).toContain(
      'export { LibraryDO } from "./link-processor";'
    );
    expect(workerEntry).not.toContain("LibraryDO as LinkProcessorDO");
    expect(libraryDoSource).toContain('bindingName: "LINK_PROCESSOR_DO"');
    expect(occurrenceCount(/"tag":\s*"v5"/g)).toBe(2);
    expect(
      occurrenceCount(/"from":\s*"LinkProcessorDO",\s*"to":\s*"LibraryDO"/g)
    ).toBe(2);
    expect(wranglerConfig).not.toMatch(
      /"name":\s*"(?:LIBRARY_DO|LINK_PROCESSOR_DO)",\s*"class_name":\s*"LinkProcessorDO"/
    );
    expect(wranglerConfig).not.toMatch(
      /"new_sqlite_classes"\s*:\s*\[[^\]]*"LibraryDO"/
    );
  });
});
