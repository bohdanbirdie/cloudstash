import { Duration, Effect, Layer } from "effect";

import { XTweetId, XUsername } from "../../db/branded";
import {
  ThreadProviderEmptyError,
  ThreadProviderHttpError,
  ThreadProviderInvalidUrlError,
  ThreadProviderResponseError,
  ThreadProviderTimeoutError,
  ThreadProviderTransportError,
} from "../errors";
import type { ThreadContext } from "../services";
import { ThreadProvider } from "../services";

const SYNDICATION_TIMEOUT = Duration.seconds(10);

interface SyndicationEntity {
  url?: string;
  expanded_url?: string;
}

interface SyndicationTweetBase {
  text?: string;
  display_text_range?: [number, number];
  user?: { name?: string; screen_name?: string };
  entities?: { urls?: SyndicationEntity[]; media?: SyndicationEntity[] };
}

interface SyndicationTweet extends SyndicationTweetBase {
  id_str?: string;
  created_at?: string;
  conversation_id_str?: string;
  in_reply_to_status_id_str?: string;
  quoted_tweet?: SyndicationTweetBase;
}

function tweetIdFromUrl(url: URL): XTweetId | null {
  const match = url.pathname.match(/\/status\/(\d+)/);
  return match?.[1] ? XTweetId.make(match[1]) : null;
}

function syndicationToken(id: XTweetId): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

function expandText(data: SyndicationTweetBase): string {
  if (!data.text) return "";
  const range = data.display_text_range;
  let text = range ? data.text.slice(range[0], range[1]) : data.text;

  const entities = [
    ...(data.entities?.urls ?? []),
    ...(data.entities?.media ?? []),
  ];
  for (const entity of entities) {
    if (entity.url && entity.expanded_url) {
      text = text.split(entity.url).join(entity.expanded_url);
    }
  }
  return text.trim();
}

function externalUrlsFrom(data: SyndicationTweetBase): string[] {
  return (data.entities?.urls ?? [])
    .map((e) => e.expanded_url)
    .filter((u): u is string => typeof u === "string" && u.length > 0);
}

const brandTweetId = (raw: string | undefined): XTweetId | null =>
  raw ? XTweetId.make(raw) : null;

const brandUsername = (raw: string | undefined): XUsername | null =>
  raw ? XUsername.make(raw) : null;

const fetchContext = Effect.fn("ThreadProviderNoop.fetchContext")(function* ({
  url,
}: {
  readonly url: string;
}) {
  const parsed = yield* Effect.try({
    try: () => new URL(url),
    catch: (cause) => new ThreadProviderInvalidUrlError({ url, cause }),
  });

  const tweetId = tweetIdFromUrl(parsed);
  if (!tweetId) {
    return yield* new ThreadProviderInvalidUrlError({ url });
  }
  yield* Effect.annotateCurrentSpan("tweetId", tweetId);

  const apiUrl = new URL("https://cdn.syndication.twimg.com/tweet-result");
  apiUrl.searchParams.set("id", tweetId);
  apiUrl.searchParams.set("token", syndicationToken(tweetId));

  const response = yield* Effect.tryPromise({
    try: () =>
      fetch(apiUrl, {
        headers: {
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://platform.twitter.com/",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        },
      }),
    catch: (cause) => new ThreadProviderTransportError({ url, cause }),
  }).pipe(
    Effect.timeoutFail({
      duration: SYNDICATION_TIMEOUT,
      onTimeout: () => new ThreadProviderTimeoutError({ url, tweetId }),
    })
  );

  yield* Effect.annotateCurrentSpan("responseStatus", response.status);
  if (!response.ok) {
    return yield* new ThreadProviderHttpError({
      url,
      status: response.status,
      tweetId,
    });
  }

  const data = yield* Effect.tryPromise({
    try: () => response.json<SyndicationTweet>(),
    catch: (cause) => new ThreadProviderResponseError({ url, tweetId, cause }),
  });

  const text = expandText(data);
  if (!text) {
    return yield* new ThreadProviderEmptyError({ url, tweetId });
  }

  const quotedText = data.quoted_tweet ? expandText(data.quoted_tweet) : null;
  yield* Effect.annotateCurrentSpan("hasQuotedTweet", quotedText !== null);

  const externalUrls = externalUrlsFrom(data);
  yield* Effect.annotateCurrentSpan("externalUrlCount", externalUrls.length);

  const rootId = brandTweetId(data.id_str) ?? tweetId;
  const root: ThreadContext["root"] = {
    id: rootId,
    text,
    authorScreenName: brandUsername(data.user?.screen_name),
    authorName: data.user?.name ?? null,
    createdAt: data.created_at ?? null,
    quotedText,
    quotedAuthorScreenName: brandUsername(data.quoted_tweet?.user?.screen_name),
    inReplyToId: brandTweetId(data.in_reply_to_status_id_str),
    conversationId: brandTweetId(data.conversation_id_str),
    externalUrls,
  };

  return {
    root,
    authorContinuations: [],
    isReply: Boolean(data.in_reply_to_status_id_str),
  };
});

export const ThreadProviderNoopLive = Layer.succeed(ThreadProvider, {
  fetchContext,
});
