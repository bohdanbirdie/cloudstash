import { describe, expect, it } from "vitest";

import { findExtractor } from "../../metadata/extractors";

describe("findExtractor", () => {
  it.each([
    ["https://github.com/foo/bar", "github"],
    ["https://www.github.com/foo/bar", "github"],
    ["https://x.com/foo/status/1", "twitter"],
    ["https://www.x.com/foo/status/1", "twitter"],
    ["https://twitter.com/foo/status/1", "twitter"],
    ["https://mobile.twitter.com/foo/status/1", "twitter"],
    ["https://www.youtube.com/watch?v=abc", "youtube"],
    ["https://m.youtube.com/watch?v=abc", "youtube"],
    ["https://youtu.be/abc", "youtube"],
  ])("dispatches %s to %s extractor", (urlStr, expected) => {
    expect(findExtractor(new URL(urlStr))?.name).toBe(expected);
  });

  it("returns null for unknown hosts", () => {
    expect(findExtractor(new URL("https://example.com"))).toBeNull();
    expect(findExtractor(new URL("https://medium.com/foo"))).toBeNull();
  });
});
