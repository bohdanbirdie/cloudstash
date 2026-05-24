import { describe, expect, it } from "@effect/vitest";

import { formatLinks } from "../generator";
import type { DigestLinkInput } from "../generator";

const sample: DigestLinkInput = {
  domain: "ex.com",
  summary: "A summary",
  tags: ["a", "b"],
  title: "Title",
  url: "https://ex.com/x",
};

describe("formatLinks", () => {
  it("returns empty string for empty input", () => {
    expect(formatLinks([])).toBe("");
  });

  it("formats one link with 1-based index", () => {
    expect(formatLinks([sample])).toBe(
      `1. "Title" — https://ex.com/x\n   tags: a, b\n   A summary`
    );
  });

  it("separates multiple links with a blank line", () => {
    const out = formatLinks([sample, { ...sample, title: "Other" }]);
    expect(out).toContain('1. "Title"');
    expect(out).toContain('2. "Other"');
    expect(out.split("\n\n")).toHaveLength(2);
  });

  it("joins tags with comma-space", () => {
    const out = formatLinks([{ ...sample, tags: ["x", "y", "z"] }]);
    expect(out).toContain("tags: x, y, z");
  });

  it("emits 'tags: ' for empty tag list", () => {
    const out = formatLinks([{ ...sample, tags: [] }]);
    expect(out).toContain("tags: \n");
  });
});
