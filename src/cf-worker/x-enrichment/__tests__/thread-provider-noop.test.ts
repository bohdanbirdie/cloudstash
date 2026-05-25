import { Effect, Either } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThreadProvider } from "../services";
import { ThreadProviderNoopLive } from "../services/thread-provider-noop.live";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

const fetchContextEffect = (url: string) =>
  ThreadProvider.pipe(
    Effect.flatMap((p) => p.fetchContext({ url })),
    Effect.provide(ThreadProviderNoopLive)
  );

const runFetchContext = (url: string) =>
  Effect.runPromise(fetchContextEffect(url));

const runFetchContextEither = (url: string) =>
  Effect.runPromise(Effect.either(fetchContextEffect(url)));

const tweetResponse = (overrides: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      id_str: "1234567890",
      created_at: "2026-05-24T15:00:00.000Z",
      conversation_id_str: "1234567890",
      text: "main tweet body https://t.co/abc",
      display_text_range: [0, 15],
      user: { name: "Alice", screen_name: "alice" },
      entities: {
        urls: [
          {
            url: "https://t.co/abc",
            expanded_url: "https://example.com/article",
          },
        ],
        media: [],
      },
      ...overrides,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );

describe("ThreadProviderNoop", () => {
  it("returns just the bookmarked tweet with no author continuations", async () => {
    mockFetch.mockResolvedValueOnce(tweetResponse());
    const ctx = await runFetchContext("https://x.com/alice/status/1234567890");
    expect(ctx.root.id).toBe("1234567890");
    expect(ctx.root.text).toBe("main tweet body");
    expect(ctx.root.authorScreenName).toBe("alice");
    expect(ctx.root.conversationId).toBe("1234567890");
    expect(ctx.authorContinuations).toEqual([]);
    expect(ctx.isReply).toBe(false);
  });

  it("exposes expanded external urls from the entities", async () => {
    mockFetch.mockResolvedValueOnce(tweetResponse());
    const ctx = await runFetchContext("https://x.com/alice/status/1234567890");
    expect(ctx.root.externalUrls).toContain("https://example.com/article");
  });

  it("marks isReply when in_reply_to_status_id_str is present", async () => {
    mockFetch.mockResolvedValueOnce(
      tweetResponse({ in_reply_to_status_id_str: "9999" })
    );
    const ctx = await runFetchContext("https://x.com/alice/status/1234567890");
    expect(ctx.isReply).toBe(true);
    expect(ctx.root.inReplyToId).toBe("9999");
  });

  it("includes quoted_tweet body and handle when present", async () => {
    mockFetch.mockResolvedValueOnce(
      tweetResponse({
        quoted_tweet: {
          text: "quoted body",
          display_text_range: [0, 11],
          user: { name: "Bob", screen_name: "bob" },
          entities: { urls: [], media: [] },
        },
      })
    );
    const ctx = await runFetchContext("https://x.com/alice/status/1234567890");
    expect(ctx.root.quotedText).toBe("quoted body");
    expect(ctx.root.quotedAuthorScreenName).toBe("bob");
  });

  it("fails with ThreadProviderHttpError on non-2xx", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const result = await runFetchContextEither(
      "https://x.com/alice/status/1234567890"
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("ThreadProviderHttpError");
      expect(result.left).toMatchObject({ status: 404 });
    }
  });

  it("fails with ThreadProviderInvalidUrlError when no tweet id in URL", async () => {
    const result = await runFetchContextEither("https://x.com/alice");
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("ThreadProviderInvalidUrlError");
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fails with ThreadProviderEmptyError when tweet text is empty", async () => {
    mockFetch.mockResolvedValueOnce(tweetResponse({ text: "" }));
    const result = await runFetchContextEither(
      "https://x.com/alice/status/1234567890"
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("ThreadProviderEmptyError");
      expect(result.left).toMatchObject({ tweetId: "1234567890" });
    }
  });

  it("fails with ThreadProviderTransportError on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("ENETDOWN"));
    const result = await runFetchContextEither(
      "https://x.com/alice/status/1234567890"
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("ThreadProviderTransportError");
    }
  });

  it("fails with ThreadProviderResponseError when body is not JSON", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("<html>not json</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );
    const result = await runFetchContextEither(
      "https://x.com/alice/status/1234567890"
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("ThreadProviderResponseError");
    }
  });
});
