import { describe, expect, it } from "vitest";

import { extractContent } from "../../link-processor/content-extractor";

describe("extractContent", () => {
  it("decodes HTML entities in title from <title> tag", () => {
    const html = `
      <html>
        <head><title>\`new Worker(&quot;pkg&quot;)\` doesn&#39;t work</title></head>
        <body><main>${"a".repeat(200)}</main></body>
      </html>
    `;
    const result = extractContent(html, "https://example.com");
    expect(result?.title).toBe('`new Worker("pkg")` doesn\'t work');
  });

  it("decodes HTML entities in title from og:title meta tag", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Fix: &amp;amp; handling in &lt;App&gt;" />
        </head>
        <body><main>${"a".repeat(200)}</main></body>
      </html>
    `;
    const result = extractContent(html, "https://example.com");
    expect(result?.title).toBe("Fix: & handling in <App>");
  });

  it("returns plain title unchanged", () => {
    const html = `
      <html>
        <head><title>Normal title</title></head>
        <body><main>${"a".repeat(200)}</main></body>
      </html>
    `;
    const result = extractContent(html, "https://example.com");
    expect(result?.title).toBe("Normal title");
  });
});
