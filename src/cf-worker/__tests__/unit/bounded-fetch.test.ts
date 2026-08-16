import { Schema } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  BoundedFetchFailure,
  fetchBoundedText,
  HttpTargetUrl,
} from "../../net/bounded-fetch";

const policy = {
  acceptedContentTypes: ["text/html"],
  maxBytes: 16,
  maxRedirects: 2,
};

type Fetcher = NonNullable<Parameters<typeof fetchBoundedText>[0]["fetcher"]>;

const run = (
  url: string,
  fetcher: Fetcher,
  options: { ownHostname?: string; signal?: AbortSignal } = {}
) =>
  Schema.decodeUnknownPromise(HttpTargetUrl(options.ownHostname))(url).then(
    (target) =>
      fetchBoundedText({
        ...policy,
        fetcher,
        signal: options.signal ?? AbortSignal.timeout(1_000),
        targetSchema: HttpTargetUrl(options.ownHostname),
        url: target,
      })
  );

const htmlResponse = (body = "<title>x</title>") =>
  new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

describe("HttpTargetUrl", () => {
  it.each([
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///etc/passwd",
    "ftp://example.com/file",
    "http://user:pass@example.com/",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://169.254.169.254/",
    "http://localhost/",
    "http://localhost./",
    "http://service.internal/",
    "http://service.internal./",
  ])("rejects hostile target %s", async (target) => {
    await expect(
      Schema.decodeUnknownPromise(HttpTargetUrl())(target)
    ).rejects.toBeDefined();
  });

  it("rejects the request's own hostname", async () => {
    await expect(
      Schema.decodeUnknownPromise(HttpTargetUrl("cloudstash.dev"))(
        "https://cloudstash.dev/api/metadata"
      )
    ).rejects.toBeDefined();
  });

  it("rejects a trailing-dot spelling of the request's own hostname", async () => {
    await expect(
      Schema.decodeUnknownPromise(HttpTargetUrl("cloudstash.dev"))(
        "https://cloudstash.dev./api/metadata"
      )
    ).rejects.toBeDefined();
  });
});

describe("fetchBoundedText", () => {
  it("validates the initial target before fetching", async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(htmlResponse());

    const error = await fetchBoundedText({
      ...policy,
      fetcher,
      signal: AbortSignal.timeout(1_000),
      targetSchema: HttpTargetUrl(),
      url: "http://127.0.0.1/private",
    }).catch((cause) => cause);

    expect(error.reason).toBe("target-rejected");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("revalidates every redirect destination", async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(
      new Response(null, {
        headers: { Location: "http://127.0.0.1/private" },
        status: 302,
      })
    );

    const error = await run("https://example.com/start", fetcher).catch(
      (cause) => cause
    );
    expect(error).toBeInstanceOf(BoundedFetchFailure);
    expect(error.reason).toBe("target-rejected");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects trailing-dot internal redirect destinations", async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(
      new Response(null, {
        headers: { Location: "http://service.internal./private" },
        status: 302,
      })
    );

    const error = await run("https://example.com/start", fetcher).catch(
      (cause) => cause
    );
    expect(error).toBeInstanceOf(BoundedFetchFailure);
    expect(error.reason).toBe("target-rejected");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects redirect chains beyond the hop bound", async () => {
    const fetcher = vi.fn<Fetcher>(
      async (url) =>
        new Response(null, {
          headers: { Location: `${url.origin}${url.pathname}/next` },
          status: 302,
        })
    );

    const error = await run("https://example.com/start", fetcher).catch(
      (cause) => cause
    );
    expect(error.reason).toBe("too-many-redirects");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("returns the final URL for relative metadata resolution", async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { Location: "https://cdn.example.org/page" },
          status: 302,
        })
      )
      .mockResolvedValueOnce(htmlResponse());

    const result = await run("https://example.com/start", fetcher);
    expect(result.finalUrl.href).toBe("https://cdn.example.org/page");
  });

  it("rejects the configured own host after a redirect", async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(
      new Response(null, {
        headers: { Location: "https://cloudstash.dev/private" },
        status: 302,
      })
    );

    const error = await run("https://example.com/start", fetcher, {
      ownHostname: "cloudstash.dev",
    }).catch((cause) => cause);
    expect(error.reason).toBe("target-rejected");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects an unsupported content type and cancels the body", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      cancel,
    });
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(
        new Response(body, { headers: { "Content-Type": "application/pdf" } })
      );

    const error = await run("https://example.com/file", fetcher).catch(
      (cause) => cause
    );
    expect(error.reason).toBe("content-type-rejected");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects a missing content type", async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(new Response("html"));
    const error = await run("https://example.com/file", fetcher).catch(
      (cause) => cause
    );
    expect(error.reason).toBe("content-type-rejected");
  });

  it("rejects a declared body length above the cap before reading", async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(
      new Response(new ReadableStream({ cancel }), {
        headers: {
          "Content-Length": "17",
          "Content-Type": "text/html",
        },
      })
    );

    const error = await run("https://example.com/large", fetcher).catch(
      (cause) => cause
    );
    expect(error.reason).toBe("body-too-large");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cancels a body that exceeds the byte bound", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        controller.enqueue(new Uint8Array(17));
      },
    });
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(
        new Response(body, { headers: { "Content-Type": "text/html" } })
      );

    const error = await run("https://example.com/large", fetcher).catch(
      (cause) => cause
    );
    expect(error.reason).toBe("body-too-large");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("accepts a streamed body exactly at the byte cap", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("12345678"));
        controller.enqueue(new TextEncoder().encode("abcdefgh"));
        controller.close();
      },
    });
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(
        new Response(body, { headers: { "Content-Type": "text/html" } })
      );

    await expect(
      run("https://example.com/exact", fetcher)
    ).resolves.toMatchObject({ body: "12345678abcdefgh" });
  });

  it("aborts a fetch at the shared deadline", async () => {
    let aborted = false;
    const fetcher = vi.fn<Fetcher>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(init.signal.reason);
          });
        })
    );

    const error = await run("https://example.com/slow", fetcher, {
      signal: AbortSignal.timeout(5),
    }).catch((cause) => cause);
    expect(error.reason).toBe("timeout");
    expect(aborted).toBe(true);
  });

  it("cancels a stalled response body at the shared deadline", async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(
      new Response(new ReadableStream({ cancel }), {
        headers: { "Content-Type": "text/html" },
      })
    );

    const error = await run("https://example.com/stalled", fetcher, {
      signal: AbortSignal.timeout(5),
    }).catch((cause) => cause);
    expect(error.reason).toBe("timeout");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("preserves upstream HTTP status in the typed failure", async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(new Response("nope", { status: 503 }));

    const error = await run("https://example.com/down", fetcher).catch(
      (cause) => cause
    );
    expect(error).toMatchObject({
      reason: "upstream-http-error",
      statusCode: 503,
    });
  });

  it("accepts a normal HTML response within the bounds", async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(htmlResponse("<title>x</title>"));
    await expect(run("https://example.com", fetcher)).resolves.toMatchObject({
      body: "<title>x</title>",
    });
  });
});
