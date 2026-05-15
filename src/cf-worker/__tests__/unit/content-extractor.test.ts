import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  extractContent,
  fetchAndExtractContent,
} from "../../link-processor/content-extractor";
import { ContentExtractorFailure } from "../../link-processor/errors";

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

describe("fetchAndExtractContent", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockResponse(init: {
    status?: number;
    headers?: Record<string, string>;
    body?: Uint8Array;
  }) {
    const body = init.body
      ? new ReadableStream<Uint8Array>({
          start(controller) {
            if (init.body) controller.enqueue(init.body);
            controller.close();
          },
        })
      : null;
    return new Response(body, {
      headers: init.headers,
      status: init.status ?? 200,
    });
  }

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>",
    "vbscript:msgbox",
    "file:///etc/passwd",
  ])("rejects %s before fetching", async (url) => {
    let fetchCalled = false;
    globalThis.fetch = (() => {
      fetchCalled = true;
      throw new Error("fetch should not be called");
    }) as typeof fetch;

    await expect(fetchAndExtractContent(url)).rejects.toBeInstanceOf(
      ContentExtractorFailure
    );
    expect(fetchCalled).toBe(false);
  });

  it("rejects body that exceeds the byte cap", async () => {
    // 6 MB of bytes against the 5 MB cap.
    const huge = new Uint8Array(6_000_000);
    globalThis.fetch = (async () =>
      mockResponse({ body: huge })) as unknown as typeof fetch;

    const error = await fetchAndExtractContent(
      "https://example.com/huge"
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ContentExtractorFailure);
    expect(error.reason).toBe("body-too-large");
  });

  it("rejects after exceeding the redirect hop limit", async () => {
    // Each fetch returns a 302 → next URL forever.
    let hops = 0;
    globalThis.fetch = (async (input: string | URL | Request) => {
      hops += 1;
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const next = `${url}/r${hops}`;
      return new Response(null, {
        headers: { location: next },
        status: 302,
      });
    }) as typeof fetch;

    const error = await fetchAndExtractContent(
      "https://example.com/start"
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ContentExtractorFailure);
    expect(error.reason).toBe("too-many-redirects");
    // 0..MAX_REDIRECTS inclusive = 6 hops before throwing.
    expect(hops).toBe(6);
  });

  it("re-validates scheme on each redirect hop", async () => {
    // Server redirects http → javascript: which must be rejected by parseHttpUrl
    // on the next iteration of the redirect loop.
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(null, {
        headers: { location: "javascript:alert(1)" },
        status: 302,
      });
    }) as typeof fetch;

    const error = await fetchAndExtractContent(
      "https://example.com/redirect"
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ContentExtractorFailure);
    expect(error.reason).toBe("scheme-rejected");
    expect(calls).toBe(1);
  });

  it("rejects non-OK final response", async () => {
    globalThis.fetch = (async () =>
      mockResponse({ status: 404 })) as unknown as typeof fetch;

    const error = await fetchAndExtractContent(
      "https://example.com/missing"
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ContentExtractorFailure);
    expect(error.reason).toBe("upstream-http-error");
  });
});
