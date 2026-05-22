import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { youtubeExtractor } from "../../metadata/extractors/youtube";

const extract = (urlStr: string) =>
  Effect.runPromise(youtubeExtractor.extract(new URL(urlStr)));

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

const oEmbedSuccess = (overrides: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      title: "Example Video Title",
      author_name: "Channel Name",
      thumbnail_url: "https://i.ytimg.com/vi/IpjcdjGBa0U/hqdefault.jpg",
      ...overrides,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );

describe("youtubeExtractor", () => {
  it("extracts title and thumbnail from oEmbed for /watch URLs", async () => {
    mockFetch.mockResolvedValueOnce(oEmbedSuccess());
    const result = await extract("https://www.youtube.com/watch?v=IpjcdjGBa0U");
    expect(result?.title).toBe("Example Video Title");
    expect(result?.description).toBe("by Channel Name");
    expect(result?.image).toBe(
      "https://i.ytimg.com/vi/IpjcdjGBa0U/hqdefault.jpg"
    );
    expect(result?.favicon).toBe("https://www.youtube.com/favicon.ico");
  });

  it("calls oEmbed with the original URL", async () => {
    mockFetch.mockResolvedValueOnce(oEmbedSuccess());
    await extract("https://youtu.be/IpjcdjGBa0U");
    const calledWith = mockFetch.mock.calls[0]?.[0] as URL;
    expect(calledWith.searchParams.get("url")).toBe(
      "https://youtu.be/IpjcdjGBa0U"
    );
    expect(calledWith.searchParams.get("format")).toBe("json");
  });

  it("returns null for channel pages without hitting oEmbed", async () => {
    const result = await extract("https://www.youtube.com/@channelname");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null for /watch without v param", async () => {
    const result = await extract("https://www.youtube.com/watch");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null on 404 (private/deleted)", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const result = await extract("https://www.youtube.com/watch?v=zzz");
    expect(result).toBeNull();
  });

  it("returns null on 429 rate limit", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 429 }));
    const result = await extract("https://www.youtube.com/watch?v=zzz");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("network"));
    const result = await extract("https://www.youtube.com/watch?v=zzz");
    expect(result).toBeNull();
  });

  it("returns null when the response body is not valid JSON", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("<html>not json</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );
    const result = await extract("https://www.youtube.com/watch?v=zzz");
    expect(result).toBeNull();
  });

  it("returns null when oEmbed has no title", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ author_name: "x" }), { status: 200 })
    );
    const result = await extract("https://www.youtube.com/watch?v=zzz");
    expect(result).toBeNull();
  });

  it("supports /shorts/", async () => {
    mockFetch.mockResolvedValueOnce(oEmbedSuccess());
    const result = await extract("https://www.youtube.com/shorts/abc123");
    expect(result?.title).toBeDefined();
  });
});
