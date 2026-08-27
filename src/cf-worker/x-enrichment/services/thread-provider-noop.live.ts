import { Duration, Effect, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";

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

const SyndicationEntity = Schema.Struct({
  url: Schema.optional(Schema.String),
  expanded_url: Schema.optional(Schema.String),
});
const SyndicationTweetBase = Schema.Struct({
  text: Schema.optional(Schema.String),
  display_text_range: Schema.optional(
    Schema.Tuple([Schema.Number, Schema.Number])
  ),
  user: Schema.optional(
    Schema.Struct({
      name: Schema.optional(Schema.String),
      screen_name: Schema.optional(Schema.String),
    })
  ),
  entities: Schema.optional(
    Schema.Struct({
      urls: Schema.optional(Schema.Array(SyndicationEntity)),
      media: Schema.optional(Schema.Array(SyndicationEntity)),
    })
  ),
});
const SyndicationTweet = Schema.Struct({
  ...SyndicationTweetBase.fields,
  id_str: Schema.optional(Schema.String),
  created_at: Schema.optional(Schema.String),
  conversation_id_str: Schema.optional(Schema.String),
  in_reply_to_status_id_str: Schema.optional(Schema.String),
  quoted_tweet: Schema.optional(SyndicationTweetBase),
});
type SyndicationTweetBase = typeof SyndicationTweetBase.Type;

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

const makeFetchContext = (client: HttpClient.HttpClient) =>
  Effect.fn("ThreadProviderNoop.fetchContext")(function* ({
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

    const response = yield* client
      .get(apiUrl, {
        headers: {
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://platform.twitter.com/",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        },
      })
      .pipe(
        Effect.mapError(
          (cause) => new ThreadProviderTransportError({ url, cause })
        ),
        Effect.timeoutOrElse({
          duration: SYNDICATION_TIMEOUT,
          orElse: () => new ThreadProviderTimeoutError({ url, tweetId }),
        })
      );

    yield* Effect.annotateCurrentSpan("responseStatus", response.status);
    if (response.status < 200 || response.status >= 300) {
      return yield* new ThreadProviderHttpError({
        url,
        status: response.status,
        tweetId,
      });
    }

    const json = yield* response.json.pipe(
      Effect.mapError(
        (cause) => new ThreadProviderResponseError({ url, tweetId, cause })
      )
    );
    const data = yield* Schema.decodeUnknownEffect(SyndicationTweet)(json).pipe(
      Effect.mapError(
        (cause) => new ThreadProviderResponseError({ url, tweetId, cause })
      )
    );

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
      quotedAuthorScreenName: brandUsername(
        data.quoted_tweet?.user?.screen_name
      ),
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

const ThreadProviderNoopLayer = Layer.effect(
  ThreadProvider,
  Effect.map(HttpClient.HttpClient, (client) =>
    ThreadProvider.of({ fetchContext: makeFetchContext(client) })
  )
);

export const ThreadProviderNoopLive = ThreadProviderNoopLayer.pipe(
  Layer.provide(FetchHttpClient.layer)
);
