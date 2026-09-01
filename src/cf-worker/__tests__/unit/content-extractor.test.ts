import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { vi } from "vitest";

import {
  extractContent,
  fetchAndExtractContent,
} from "../../link-processor/content-extractor";
import { ContentExtractorFailure } from "../../link-processor/errors";
import {
  ContentExtractor,
  MetadataFetcher,
} from "../../link-processor/services";
import { makeContentExtractorLive } from "../../link-processor/services/content-extractor.live";
import { MetadataFetcherLive } from "../../link-processor/services/metadata-fetcher.live";
import { MetadataFetchError, MetadataParseError } from "../../metadata/errors";

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
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...init.headers,
      },
      status: init.status ?? 200,
    });
  }

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>",
    "vbscript:msgbox",
    "file:///etc/passwd",
  ])("rejects %s before fetching", async (url) => {
    const fetcher = vi.fn(() => {
      throw new Error("fetch should not be called");
    }) as typeof fetch;

    await expect(fetchAndExtractContent(url, fetcher)).rejects.toBeInstanceOf(
      ContentExtractorFailure
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects body that exceeds the byte cap", async () => {
    // 6 MB of bytes against the 5 MB cap.
    const huge = new Uint8Array(6_000_000);
    const fetcher = (async () =>
      mockResponse({ body: huge })) as unknown as typeof fetch;

    const error = await fetchAndExtractContent(
      "https://example.com/huge",
      fetcher
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ContentExtractorFailure);
    expect(error.reason).toBe("body-too-large");
  });

  it("rejects after exceeding the redirect hop limit", async () => {
    // Each fetch returns a 302 → next URL forever.
    let hops = 0;
    const fetcher = (async (input: string | URL | Request) => {
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
      "https://example.com/start",
      fetcher
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
    const fetcher = (async () => {
      calls += 1;
      return new Response(null, {
        headers: { location: "javascript:alert(1)" },
        status: 302,
      });
    }) as typeof fetch;

    const error = await fetchAndExtractContent(
      "https://example.com/redirect",
      fetcher
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ContentExtractorFailure);
    expect(error.reason).toBe("scheme-rejected");
    expect(calls).toBe(1);
  });

  it("rejects the application host before processing content", async () => {
    const fetcher = vi.fn();

    const error = await fetchAndExtractContent(
      "https://cloudstash.dev/private",
      fetcher as unknown as typeof fetch,
      "cloudstash.dev"
    ).catch((cause) => cause);

    expect(error).toBeInstanceOf(ContentExtractorFailure);
    expect(error.reason).toBe("scheme-rejected");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects redirects to the application host while processing content", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        new Response(null, {
          headers: { location: "https://cloudstash.dev/private" },
          status: 302,
        })
      )
    ) as unknown as typeof fetch;

    const error = await fetchAndExtractContent(
      "https://example.com/redirect",
      fetcher,
      "cloudstash.dev"
    ).catch((cause) => cause);

    expect(error).toBeInstanceOf(ContentExtractorFailure);
    expect(error.reason).toBe("scheme-rejected");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects non-OK final response", async () => {
    const fetcher = (async () =>
      mockResponse({ status: 404 })) as unknown as typeof fetch;

    const error = await fetchAndExtractContent(
      "https://example.com/missing",
      fetcher
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ContentExtractorFailure);
    expect(error.reason).toBe("upstream-http-error");
  });

  it.live("retries unknown transport failures twice", () => {
    const fetcher = vi.fn(() => Promise.reject(new Error("offline")));
    return Effect.gen(function* () {
      const extractor = yield* ContentExtractor;

      expect(yield* extractor.extract("https://example.com/page")).toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(3);
    }).pipe(
      Effect.provide(
        makeContentExtractorLive(fetcher as unknown as typeof fetch)
      )
    );
  });

  it.live("retries typed timeout failures twice", () => {
    const fetcher = vi.fn(() => Promise.reject(new Error("timed out")));
    return Effect.gen(function* () {
      const extractor = yield* ContentExtractor;

      expect(yield* extractor.extract("https://example.com/page")).toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(3);
    }).pipe(
      Effect.provide(
        makeContentExtractorLive(
          fetcher as unknown as typeof fetch,
          undefined,
          () => AbortSignal.abort()
        )
      )
    );
  });

  it.live("does not retry terminal upstream responses", () => {
    const fetcher = vi.fn(() => Promise.resolve(mockResponse({ status: 404 })));
    return Effect.gen(function* () {
      const extractor = yield* ContentExtractor;

      expect(yield* extractor.extract("https://example.com/page")).toBeNull();
      expect(fetcher).toHaveBeenCalledOnce();
    }).pipe(
      Effect.provide(
        makeContentExtractorLive(fetcher as unknown as typeof fetch)
      )
    );
  });

  it.live("rejects the application host before processing metadata", () => {
    const fetcher = vi.fn();
    return Effect.gen(function* () {
      const metadataFetcher = yield* MetadataFetcher;
      const error = yield* Effect.flip(
        metadataFetcher.fetch("https://cloudstash.dev/private")
      );

      expect(error._tag).toBe("MetadataFetchError");
      if (error._tag === "MetadataFetchError") {
        expect(error.reason).toBe("target-rejected");
      }
      expect(fetcher).not.toHaveBeenCalled();
    }).pipe(
      Effect.provide(
        MetadataFetcherLive(
          "cloudstash.dev",
          fetcher as unknown as typeof fetch
        )
      )
    );
  });

  it.live(
    "rejects redirects to the application host while processing metadata",
    () => {
      const fetcher = vi.fn(() =>
        Promise.resolve(
          new Response(null, {
            headers: { location: "https://cloudstash.dev/private" },
            status: 302,
          })
        )
      ) as unknown as typeof fetch;
      return Effect.gen(function* () {
        const metadataFetcher = yield* MetadataFetcher;
        const error = yield* Effect.flip(
          metadataFetcher.fetch("https://example.com/redirect")
        );

        expect(error._tag).toBe("MetadataFetchError");
        if (error._tag === "MetadataFetchError") {
          expect(error.reason).toBe("target-rejected");
        }
        expect(fetcher).toHaveBeenCalledOnce();
      }).pipe(Effect.provide(MetadataFetcherLive("cloudstash.dev", fetcher)));
    }
  );

  it.live.each([
    [
      "unknown transport failure",
      () => Promise.reject(new Error("offline")),
      3,
      "unknown",
      undefined,
    ],
    [
      "rate limit",
      () => Promise.resolve(mockResponse({ status: 429 })),
      3,
      "upstream-http-error",
      429,
    ],
    [
      "server failure",
      () => Promise.resolve(mockResponse({ status: 503 })),
      3,
      "upstream-http-error",
      503,
    ],
    [
      "ordinary client failure",
      () => Promise.resolve(mockResponse({ status: 404 })),
      1,
      "upstream-http-error",
      404,
    ],
  ] as const)(
    "classifies metadata %s retries",
    ([_name, response, attempts, reason, statusCode]) => {
      const fetcher = vi.fn(response) as unknown as typeof fetch;
      return Effect.gen(function* () {
        const metadataFetcher = yield* MetadataFetcher;
        const error = yield* Effect.flip(
          metadataFetcher.fetch("https://example.com/page")
        );

        expect(error).toBeInstanceOf(MetadataFetchError);
        if (error._tag === "MetadataFetchError") {
          expect(error.reason).toBe(reason);
          expect(error.statusCode).toBe(statusCode);
        }
        expect(fetcher).toHaveBeenCalledTimes(attempts);
      }).pipe(Effect.provide(MetadataFetcherLive("cloudstash.dev", fetcher)));
    }
  );

  it.effect("retries outer metadata TimeoutError twice", () => {
    const fetcher = vi.fn(() => new Promise<Response>(() => undefined));
    return Effect.gen(function* () {
      const metadataFetcher = yield* MetadataFetcher;
      const fiber = yield* metadataFetcher
        .fetch("https://example.com/page")
        .pipe(Effect.flip, Effect.forkChild);

      yield* TestClock.adjust("31 seconds");
      const error = yield* Fiber.join(fiber);

      expect(error._tag).toBe("TimeoutError");
      expect(fetcher).toHaveBeenCalledTimes(3);
    }).pipe(
      Effect.provide(
        MetadataFetcherLive(
          "cloudstash.dev",
          fetcher as unknown as typeof fetch
        )
      )
    );
  });

  it.live("retries typed metadata timeout failures twice", () => {
    const fetcher = vi.fn(() => Promise.reject(new Error("timed out")));
    return Effect.gen(function* () {
      const metadataFetcher = yield* MetadataFetcher;
      const error = yield* Effect.flip(
        metadataFetcher.fetch("https://example.com/page")
      );

      expect(error).toBeInstanceOf(MetadataFetchError);
      if (error._tag === "MetadataFetchError") {
        expect(error.reason).toBe("timeout");
        expect(error.statusCode).toBeUndefined();
      }
      expect(fetcher).toHaveBeenCalledTimes(3);
    }).pipe(
      Effect.provide(
        MetadataFetcherLive(
          "cloudstash.dev",
          fetcher as unknown as typeof fetch,
          () => AbortSignal.abort()
        )
      )
    );
  });

  it.live("does not retry metadata parse failures", () => {
    vi.stubGlobal(
      "HTMLRewriter",
      class {
        on() {
          return this;
        }

        transform() {
          return {
            text: () => Promise.reject(new Error("parse failed")),
          };
        }
      }
    );
    const fetcher = vi.fn(() =>
      Promise.resolve(
        mockResponse({ body: new TextEncoder().encode("<html></html>") })
      )
    ) as unknown as typeof fetch;
    return Effect.gen(function* () {
      try {
        const metadataFetcher = yield* MetadataFetcher;
        const error = yield* Effect.flip(
          metadataFetcher.fetch("https://example.com/page")
        );

        expect(error).toBeInstanceOf(MetadataParseError);
        expect(fetcher).toHaveBeenCalledOnce();
      } finally {
        vi.unstubAllGlobals();
      }
    }).pipe(Effect.provide(MetadataFetcherLive("cloudstash.dev", fetcher)));
  });
});
