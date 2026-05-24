import { Effect } from "effect";

import type { Extractor } from "./types";

interface TweetEntity {
  url: string;
  expanded_url: string;
}

interface TweetMediaDetail {
  media_url_https?: string;
}

interface TweetBase {
  text?: string;
  display_text_range?: [number, number];
  user?: { name?: string; screen_name?: string };
  entities?: {
    urls?: TweetEntity[];
    media?: TweetEntity[];
  };
}

interface TweetResponse extends TweetBase {
  mediaDetails?: TweetMediaDetail[];
  quoted_tweet?: TweetBase;
}

function tweetIdFromUrl(url: URL): string | null {
  const match = url.pathname.match(/\/status\/(\d+)/);
  return match?.[1] ?? null;
}

// Locked-in by fixture tests: any drift in Number precision or the regex
// silently 400s every tweet fetch (the syndication endpoint validates the token
// shape on the server).
function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

const TITLE_BODY_MAX = 140;

function expandText(data: TweetBase): string | null {
  if (!data.text) return null;
  // display_text_range marks the displayable tweet body, excluding auto-appended
  // trailing media URLs (the "https://t.co/..." that points to a photo/video).
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

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  // Only break at word boundary if it doesn't lose more than ~30% of the budget.
  const cutoff = lastSpace > max * 0.7 ? lastSpace : max;
  return `${slice.slice(0, cutoff).trimEnd()}…`;
}

function firstChunk(text: string, max: number): string {
  if (text.length <= max) return text;

  let breakIdx = -1;

  const newlineIdx = text.indexOf("\n");
  if (newlineIdx > 0) breakIdx = newlineIdx;

  const sentenceMatch = text.match(/[.!?](?=\s|$)/);
  if (sentenceMatch?.index !== undefined) {
    const sentenceEnd = sentenceMatch.index + 1;
    if (breakIdx === -1 || sentenceEnd < breakIdx) breakIdx = sentenceEnd;
  }

  if (breakIdx > 0 && breakIdx <= max) {
    return text.slice(0, breakIdx).trimEnd();
  }

  return truncate(text, max);
}

export const twitterExtractor: Extractor = {
  name: "twitter",
  authoritative: true,
  extract: (url: URL) =>
    Effect.gen(function* () {
      const id = tweetIdFromUrl(url);
      if (!id) return null;

      const apiUrl = new URL("https://cdn.syndication.twimg.com/tweet-result");
      apiUrl.searchParams.set("id", id);
      apiUrl.searchParams.set("token", syndicationToken(id));

      const response = yield* Effect.tryPromise(() =>
        fetch(apiUrl, {
          headers: {
            Accept: "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: "https://platform.twitter.com/",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          },
        })
      );
      if (!response.ok) return null;

      const data = (yield* Effect.tryPromise(() =>
        response.json()
      )) as TweetResponse;

      const fullText = expandText(data);
      if (!fullText) return null;

      const author = data.user?.name ?? data.user?.screen_name;
      const image = data.mediaDetails?.[0]?.media_url_https;

      const quotedText = data.quoted_tweet
        ? expandText(data.quoted_tweet)
        : null;
      const quotedHandle = data.quoted_tweet?.user?.screen_name;
      const quotedSegment = quotedText
        ? `Quoting ${quotedHandle ? `@${quotedHandle}` : "another tweet"}: ${quotedText}`
        : null;

      const titleBody = firstChunk(fullText, TITLE_BODY_MAX);
      const title = author ? `${author}: ${titleBody}` : titleBody;
      const mainDescription = titleBody === fullText ? undefined : fullText;
      const description = quotedSegment
        ? mainDescription
          ? `${mainDescription}\n\n${quotedSegment}`
          : quotedSegment
        : mainDescription;

      return {
        title,
        description,
        image,
        favicon: "https://abs.twimg.com/favicons/twitter.3.ico",
      };
    }).pipe(
      Effect.withSpan("extractor.twitter.extract"),
      Effect.catchAll(() => Effect.succeed(null))
    ),
};
