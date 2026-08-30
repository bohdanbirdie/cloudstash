import { describe, expect, it } from "@effect/vitest";

import {
  DIGEST_USER_PROMPT_MAX_CHARS,
  formatDigestPrompt,
  formatLinks,
} from "../generator";
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

  it("bounds untrusted fields and removes their structural whitespace", () => {
    const out = formatLinks([
      {
        ...sample,
        summary: `summary\n${"s".repeat(1000)}`,
        tags: Array.from(
          { length: 20 },
          (_, index) => `tag-${index}-${"x".repeat(30)}`
        ),
        title: `title\n${"t".repeat(500)}`,
      },
    ]);

    expect(out).not.toContain("title\n");
    expect(out).not.toContain("summary\n");
    expect(out).toContain("tag-4-");
    expect(out).not.toContain("tag-5-");
    expect(out).toContain("…");
  });

  it("skips links whose exact URL cannot fit safely", () => {
    expect(
      formatLinks([
        { ...sample, url: `https://example.com/${"x".repeat(3000)}` },
      ])
    ).toBe("");
  });

  it("caps the complete user prompt without cutting a record", () => {
    const links = Array.from({ length: 100 }, (_, index) => ({
      ...sample,
      summary: "s".repeat(1000),
      tags: Array.from({ length: 20 }, () => "tag".repeat(20)),
      title: `Link ${index} ${"t".repeat(500)}`,
      url: `https://example.com/${index}/${"u".repeat(1000)}`,
    }));
    const prompt = formatDigestPrompt(links);

    expect(prompt.length).toBeLessThanOrEqual(DIGEST_USER_PROMPT_MAX_CHARS);
    expect(prompt).not.toMatch(/https:\/\/example\.com\/\d+\/u+…/);
  });
});
