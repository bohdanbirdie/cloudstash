import { describe, expect, it } from "vitest";

import { OrgId } from "../../db/branded";
import { ENRICHMENT_USAGE_KEY, getCurrentPeriod, isXTweetUrl } from "../types";

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

describe("getCurrentPeriod", () => {
  it("returns YYYY-MM in UTC", () => {
    const period = getCurrentPeriod();
    expect(period).toMatch(/^\d{4}-\d{2}$/);
    expect(period).toBe(new Date().toISOString().slice(0, 7));
  });
});

describe("ENRICHMENT_USAGE_KEY", () => {
  it("composes a deterministic per-org per-period key", () => {
    const storeId = OrgId.make("org-abc");
    expect(ENRICHMENT_USAGE_KEY(storeId, "2026-05")).toBe(
      "enrichment:org-abc:2026-05"
    );
  });
});
