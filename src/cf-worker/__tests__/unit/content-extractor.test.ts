import { describe, expect, it } from "vitest";

import { extractContent } from "../../link-processor/content-extractor";

describe("extractContent", () => {
  it("extracts title from HTML", async () => {
    const html = `
      <html>
        <head><title>Test Page Title</title></head>
        <body><main><p>${"a ".repeat(200)}</p></main></body>
      </html>
    `;
    const result = await extractContent(html, "https://example.com");
    expect(result?.title).toBe("Test Page Title");
  });

  it("returns markdown content", async () => {
    const html = `
      <html>
        <head><title>Test</title></head>
        <body><main><p>${"Hello world paragraph content here for testing extraction. ".repeat(20)}</p></main></body>
      </html>
    `;
    const result = await extractContent(html, "https://example.com");
    expect(result).not.toBeNull();
    expect(result!.content).toContain("Hello world paragraph content");
  });

  it("returns null for pages with insufficient content", async () => {
    const html = `
      <html>
        <head><title>Empty</title></head>
        <body><main><p>Short</p></main></body>
      </html>
    `;
    const result = await extractContent(html, "https://example.com");
    expect(result).toBeNull();
  });

  it("includes wordCount in result", async () => {
    const html = `
      <html>
        <head><title>Test</title></head>
        <body><main><p>${"word ".repeat(200)}</p></main></body>
      </html>
    `;
    const result = await extractContent(html, "https://example.com");
    expect(result?.wordCount).toBeGreaterThan(0);
  });
});
