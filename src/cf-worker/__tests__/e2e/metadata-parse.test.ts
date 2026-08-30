import { describe, expect, it } from "vitest";

import { parseMetadataHtml } from "../../metadata/parser";

// WK-14-A. service.ts and extractors/twitter.ts each carried their own copy of
// the fetch -> MetadataParser -> HTMLRewriter -> getResult pipeline, and the
// copies had drifted: only service.ts registered the `title` handler, and the
// two sent different bot user-agents. Both now share this helper.
//
// This lives in e2e because HTMLRewriter is a Workers runtime global. The unit
// environment has no real one, which is why extractors/twitter.ts's HTML path
// had no coverage before — its tests inject a fake og-image lookup and never
// reach the parser.

const page = (head: string) =>
  `<!doctype html><html><head>${head}</head><body>hi</body></html>`;

const parse = (head: string, url = "https://example.com/article") =>
  parseMetadataHtml(page(head), new URL(url));

describe("parseMetadataHtml", () => {
  it("reads title, description and image from og tags", async () => {
    const result = await parse(`
      <meta property="og:title" content="OG title" />
      <meta property="og:description" content="OG description" />
      <meta property="og:image" content="https://cdn.test/a.png" />
    `);

    expect(result).toMatchObject({
      description: "OG description",
      image: "https://cdn.test/a.png",
      title: "OG title",
    });
  });

  it("takes the first title in document order", async () => {
    // Each field is first-wins, so a <title> ahead of og:title keeps its value.
    const result = await parse(`
      <title>Document title</title>
      <meta property="og:title" content="OG title" />
    `);

    expect(result.title).toBe("Document title");
  });

  it("registers the title handler, which the extractor path previously lacked", async () => {
    const result = await parse("<title>Just a title</title>");
    expect(result.title).toBe("Just a title");
  });

  it("resolves a relative image against the final URL", async () => {
    const result = await parse(
      '<meta property="og:image" content="/img/hero.png" />',
      "https://example.com/deep/page"
    );
    expect(result.image).toBe("https://example.com/img/hero.png");
  });

  it("returns an empty result for a page with no metadata", async () => {
    expect(await parse("")).toEqual({});
  });
});
