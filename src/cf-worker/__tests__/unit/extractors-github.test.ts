import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { githubExtractor } from "../../metadata/extractors/github";

const extract = (urlStr: string) =>
  Effect.runPromise(githubExtractor.extract(new URL(urlStr)));

describe("githubExtractor", () => {
  it("extracts org/repo from a repo root", async () => {
    const result = await extract("https://github.com/example-org/example-repo");
    expect(result?.title).toBe("example-org/example-repo");
  });

  it("is non-authoritative so OG fills description/image", async () => {
    expect(githubExtractor.authoritative).toBe(false);
    const result = await extract("https://github.com/example-org/example-repo");
    expect(result).toEqual({ title: "example-org/example-repo" });
  });

  it("strips /tree/branch/path", async () => {
    const result = await extract(
      "https://github.com/example-org/example-repo/tree/main?tab=readme-ov-file"
    );
    expect(result?.title).toBe("example-org/example-repo");
  });

  it("strips /blob/branch/path", async () => {
    const result = await extract(
      "https://github.com/another-org/another-repo/blob/main/README.md"
    );
    expect(result?.title).toBe("another-org/another-repo");
  });

  it("formats issues as org/repo#NN", async () => {
    const result = await extract(
      "https://github.com/another-org/another-repo/issues/12345"
    );
    expect(result?.title).toBe("another-org/another-repo#12345");
  });

  it("formats pull requests as org/repo#NN", async () => {
    const result = await extract(
      "https://github.com/another-org/another-repo/pull/28000"
    );
    expect(result?.title).toBe("another-org/another-repo#28000");
  });

  it("formats discussions as org/repo#NN", async () => {
    const result = await extract(
      "https://github.com/another-org/another-repo/discussions/100"
    );
    expect(result?.title).toBe("another-org/another-repo#100");
  });

  it("falls back to org/repo for non-numbered sections", async () => {
    const result = await extract(
      "https://github.com/another-org/another-repo/actions"
    );
    expect(result?.title).toBe("another-org/another-repo");
  });

  it("returns null for top-level user pages", async () => {
    const result = await extract("https://github.com/someuser");
    expect(result).toBeNull();
  });

  it("returns null for the homepage", async () => {
    const result = await extract("https://github.com/");
    expect(result).toBeNull();
  });
});
