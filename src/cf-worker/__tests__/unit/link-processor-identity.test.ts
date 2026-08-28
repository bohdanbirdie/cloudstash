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

describe("LinkProcessorDO identity", () => {
  it("keeps production on its original class and namespace", () => {
    const productionConfig = wranglerConfig.slice(
      0,
      wranglerConfig.indexOf('"env"')
    );

    expect(productionConfig).toContain(
      '{ "name": "LINK_PROCESSOR_DO", "class_name": "LinkProcessorDO" }'
    );
    expect(productionConfig).not.toContain("LibraryDO");
    expect(productionConfig).not.toMatch(/"tag":\s*"v[56]"/);
    expect(workerEntry).toContain(
      'export { LinkProcessorDO } from "./link-processor";'
    );
  });

  it("reverses only staging's already-applied class rename", () => {
    expect(
      occurrenceCount(
        /"name":\s*"LINK_PROCESSOR_DO",\s*"class_name":\s*"LinkProcessorDO"/g
      )
    ).toBe(2);
    expect(wranglerConfig).toContain(
      '{ "from": "LinkProcessorDO", "to": "LibraryDO" }'
    );
    expect(wranglerConfig).toContain(
      '{ "from": "LibraryDO", "to": "LinkProcessorDO" }'
    );
  });
});
