import { describe, expect, it } from "vitest";

import { parseJsonLd } from "../../metadata/jsonld";

describe("parseJsonLd", () => {
  it("returns empty for invalid JSON", () => {
    expect(parseJsonLd("not json")).toEqual({});
  });

  it("extracts headline from a NewsArticle", () => {
    const raw = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: "Breaking news",
      description: "Article description",
      image: "https://example.com/image.jpg",
    });
    expect(parseJsonLd(raw)).toEqual({
      title: "Breaking news",
      description: "Article description",
      image: "https://example.com/image.jpg",
    });
  });

  it("falls back to name when headline is missing", () => {
    const raw = JSON.stringify({
      "@type": "Article",
      name: "Article name",
    });
    expect(parseJsonLd(raw).title).toBe("Article name");
  });

  it("walks @graph to find an article node", () => {
    const raw = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", name: "Site name" },
        { "@type": "NewsArticle", headline: "Article headline" },
      ],
    });
    expect(parseJsonLd(raw).title).toBe("Article headline");
  });

  it("handles JSON-LD arrays", () => {
    const raw = JSON.stringify([
      { "@type": "Organization", name: "Org" },
      { "@type": "Article", headline: "Headline" },
    ]);
    expect(parseJsonLd(raw).title).toBe("Headline");
  });

  it("handles array @type", () => {
    const raw = JSON.stringify({
      "@type": ["Article", "NewsArticle"],
      headline: "Multi-type article",
    });
    expect(parseJsonLd(raw).title).toBe("Multi-type article");
  });

  it("extracts image from object form", () => {
    const raw = JSON.stringify({
      "@type": "Article",
      headline: "x",
      image: { url: "https://example.com/img.jpg" },
    });
    expect(parseJsonLd(raw).image).toBe("https://example.com/img.jpg");
  });

  it("extracts image from array form", () => {
    const raw = JSON.stringify({
      "@type": "Article",
      headline: "x",
      image: [
        "https://example.com/first.jpg",
        "https://example.com/second.jpg",
      ],
    });
    expect(parseJsonLd(raw).image).toBe("https://example.com/first.jpg");
  });

  it("falls back to thumbnailUrl when image is missing", () => {
    const raw = JSON.stringify({
      "@type": "VideoObject",
      headline: "x",
      thumbnailUrl: "https://example.com/thumb.jpg",
    });
    expect(parseJsonLd(raw).image).toBe("https://example.com/thumb.jpg");
  });

  it("preserves &amp; in image URLs (parser is responsible for decoding)", () => {
    const raw = JSON.stringify({
      "@type": "Article",
      headline: "x",
      image: "https://example.com/img.jpg?a=1&amp;b=2",
    });
    expect(parseJsonLd(raw).image).toBe(
      "https://example.com/img.jpg?a=1&amp;b=2"
    );
  });

  it("returns empty when no recognizable node exists", () => {
    const raw = JSON.stringify({ unrelated: "data" });
    expect(parseJsonLd(raw)).toEqual({});
  });
});
