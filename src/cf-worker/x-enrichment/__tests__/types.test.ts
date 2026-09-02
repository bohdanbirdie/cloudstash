import { describe, expect, it } from "vitest";

import { isXTweetUrl } from "../types";

describe("isXTweetUrl", () => {
  it.each([
    ["https://x.com/foo/status/1234567890", true],
    ["https://twitter.com/foo/status/1234567890", true],
    ["https://x.com/foo/status/123/photo/1", true],
    ["https://x.com/foo", false],
    ["https://x.com/i/lists/123", false],
    ["https://example.com/foo/status/1234567890", false],
    ["not a url at all", false],
  ])("%s → %s", (url, expected) => {
    expect(isXTweetUrl(url)).toBe(expected);
  });
});
