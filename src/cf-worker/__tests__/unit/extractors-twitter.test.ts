import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { twitterExtractor } from "../../metadata/extractors/twitter";

const extract = (urlStr: string) =>
  Effect.runPromise(twitterExtractor.extract(new URL(urlStr)));

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

const tweetResponse = (overrides: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      text: "short tweet body https://t.co/abc12345",
      display_text_range: [0, 16],
      user: { name: "Author Name", screen_name: "authorhandle" },
      entities: {
        urls: [],
        media: [
          {
            url: "https://t.co/abc12345",
            expanded_url: "https://x.com/authorhandle/status/12345/video/1",
          },
        ],
      },
      mediaDetails: [
        {
          media_url_https: "https://pbs.twimg.com/media/test.jpg",
        },
      ],
      ...overrides,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );

describe("twitterExtractor", () => {
  it("prefixes title with author and drops the auto-appended media URL", async () => {
    mockFetch.mockResolvedValueOnce(tweetResponse());
    const result = await extract("https://x.com/authorhandle/status/12345");
    expect(result?.title).toBe("Author Name: short tweet body");
    expect(result?.description).toBeUndefined();
    expect(result?.image).toBe("https://pbs.twimg.com/media/test.jpg");
  });

  it("expands inline t.co URLs within display_text_range", async () => {
    mockFetch.mockResolvedValueOnce(
      tweetResponse({
        text: "Cool article https://t.co/abcd https://t.co/imgxyz",
        display_text_range: [0, 30],
        entities: {
          urls: [
            {
              url: "https://t.co/abcd",
              expanded_url: "https://example.com/article",
            },
          ],
          media: [
            {
              url: "https://t.co/imgxyz",
              expanded_url: "https://x.com/.../photo/1",
            },
          ],
        },
        mediaDetails: [],
      })
    );
    const result = await extract("https://x.com/foo/status/123");
    expect(result?.title).toBe(
      "Author Name: Cool article https://example.com/article"
    );
  });

  it("falls back to full text when display_text_range is missing", async () => {
    mockFetch.mockResolvedValueOnce(
      tweetResponse({
        text: "no range provided",
        display_text_range: undefined,
        entities: { urls: [], media: [] },
        mediaDetails: [],
      })
    );
    const result = await extract("https://x.com/foo/status/123");
    expect(result?.title).toBe("Author Name: no range provided");
  });

  it.each([
    ["1996931003240403022", "4u9jkq3ymyn"],
    ["1234567890123456789", "2zqic77uqyk"],
    ["100000000000000000", "8q5qeon85v4"],
  ])(
    "computes the syndication token deterministically (id=%s)",
    async (id, expectedToken) => {
      mockFetch.mockResolvedValueOnce(tweetResponse());
      await extract(`https://x.com/foo/status/${id}`);
      const calledWith = mockFetch.mock.calls[0]?.[0] as URL;
      expect(calledWith.searchParams.get("id")).toBe(id);
      expect(calledWith.searchParams.get("token")).toBe(expectedToken);
    }
  );

  it("returns null when URL has no tweet id", async () => {
    const result = await extract("https://x.com/authorhandle");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null on 404", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const result = await extract("https://x.com/foo/status/123");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("network"));
    const result = await extract("https://x.com/foo/status/123");
    expect(result).toBeNull();
  });

  it("returns null when the response body is not valid JSON", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("<html>not json</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );
    const result = await extract("https://x.com/foo/status/123");
    expect(result).toBeNull();
  });

  it("returns null when text is empty", async () => {
    mockFetch.mockResolvedValueOnce(tweetResponse({ text: "" }));
    const result = await extract("https://x.com/foo/status/123");
    expect(result).toBeNull();
  });

  it("ends title at first sentence boundary and puts full body in description", async () => {
    const longText =
      "First sentence ends here. Second sentence continues. Third sentence has more content. Fourth sentence keeps going. Fifth sentence pushes past the 140-character title budget so we exercise the chunk path.";
    mockFetch.mockResolvedValueOnce(
      tweetResponse({
        text: longText,
        display_text_range: [0, longText.length],
        entities: { urls: [], media: [] },
        mediaDetails: [],
        user: { name: "Long Tweet Author", screen_name: "longtweetauthor" },
      })
    );
    const result = await extract("https://x.com/foo/status/123");
    expect(result?.title).toBe("Long Tweet Author: First sentence ends here.");
    expect(result?.description).toBe(longText);
  });

  it("ends title at first newline when one comes before the first sentence", async () => {
    const text =
      "Heading line of the post 🖐️\n\nBody paragraph follows here. The thread continues with much more detail in subsequent lines that push the total length past the title budget so we exercise the chunk path.";
    mockFetch.mockResolvedValueOnce(
      tweetResponse({
        text,
        display_text_range: [0, text.length],
        entities: { urls: [], media: [] },
        mediaDetails: [],
        user: { name: "Reel Author", screen_name: "reelauthor" },
      })
    );
    const result = await extract("https://x.com/foo/status/123");
    expect(result?.title).toBe("Reel Author: Heading line of the post 🖐️");
    expect(result?.description).toBe(text);
  });

  it("falls back to length truncation when no natural break fits the budget", async () => {
    const text =
      "this is a long unbroken stretch of text without any sentence ending or paragraph break that just keeps going on and on and on past the title budget so that we have to truncate";
    mockFetch.mockResolvedValueOnce(
      tweetResponse({
        text,
        display_text_range: [0, text.length],
        entities: { urls: [], media: [] },
        mediaDetails: [],
        user: { name: "Author", screen_name: "author" },
      })
    );
    const result = await extract("https://x.com/foo/status/123");
    const title = result?.title ?? "";
    expect(title.startsWith("Author: ")).toBe(true);
    expect(title.endsWith("…")).toBe(true);
    expect(result?.description).toBe(text);
  });

  it("uses screen_name as author when name is missing", async () => {
    mockFetch.mockResolvedValueOnce(
      tweetResponse({
        user: { screen_name: "authorhandle" },
      })
    );
    const result = await extract("https://x.com/foo/status/123");
    expect(result?.title).toBe("authorhandle: short tweet body");
  });

  it("expands non-media entity URLs as well", async () => {
    const text = "Check this https://t.co/abcd";
    mockFetch.mockResolvedValueOnce(
      tweetResponse({
        text,
        display_text_range: [0, text.length],
        entities: {
          urls: [
            { url: "https://t.co/abcd", expanded_url: "https://example.com/x" },
          ],
          media: [],
        },
        mediaDetails: [],
      })
    );
    const result = await extract("https://x.com/foo/status/123");
    expect(result?.title).toBe("Author Name: Check this https://example.com/x");
  });

  it("folds quoted-tweet body into description when main fits in title", async () => {
    mockFetch.mockResolvedValueOnce(
      tweetResponse({
        quoted_tweet: {
          text: "original take https://t.co/zzz",
          display_text_range: [0, 13],
          user: { name: "Quoted Author", screen_name: "quotedhandle" },
          entities: { urls: [], media: [] },
        },
      })
    );
    const result = await extract("https://x.com/foo/status/123");
    expect(result?.title).toBe("Author Name: short tweet body");
    expect(result?.description).toBe("Quoting @quotedhandle: original take");
  });

  it("appends quoted segment after full body when main spills past title", async () => {
    const longText =
      "First sentence ends here. Second sentence continues. Third sentence has more content. Fourth sentence keeps going. Fifth sentence pushes past the 140-character title budget so we exercise the chunk path.";
    mockFetch.mockResolvedValueOnce(
      tweetResponse({
        text: longText,
        display_text_range: [0, longText.length],
        entities: { urls: [], media: [] },
        mediaDetails: [],
        user: { name: "Long Tweet Author", screen_name: "longtweetauthor" },
        quoted_tweet: {
          text: "the thing being quoted",
          display_text_range: [0, 22],
          user: { name: "Quoted Author", screen_name: "quotedhandle" },
          entities: { urls: [], media: [] },
        },
      })
    );
    const result = await extract("https://x.com/foo/status/123");
    expect(result?.title).toBe("Long Tweet Author: First sentence ends here.");
    expect(result?.description).toBe(
      `${longText}\n\nQuoting @quotedhandle: the thing being quoted`
    );
  });

  it("falls back to 'another tweet' when quoted tweet has no screen_name", async () => {
    mockFetch.mockResolvedValueOnce(
      tweetResponse({
        quoted_tweet: {
          text: "anonymous quoted body",
          display_text_range: [0, 21],
          entities: { urls: [], media: [] },
        },
      })
    );
    const result = await extract("https://x.com/foo/status/123");
    expect(result?.description).toBe(
      "Quoting another tweet: anonymous quoted body"
    );
  });

  it("ignores quoted_tweet when its text is empty", async () => {
    mockFetch.mockResolvedValueOnce(
      tweetResponse({
        quoted_tweet: {
          text: "",
          user: { screen_name: "quotedhandle" },
          entities: { urls: [], media: [] },
        },
      })
    );
    const result = await extract("https://x.com/foo/status/123");
    expect(result?.description).toBeUndefined();
  });
});
