import { Effect, Schema } from "effect";

import { fetchBoundedText } from "../../net/bounded-fetch";
import { defaultExtractorContext } from "./types";
import type { Extractor } from "./types";

const OEmbedResponse = Schema.Struct({
  title: Schema.optional(Schema.String),
  author_name: Schema.optional(Schema.String),
  thumbnail_url: Schema.optional(Schema.String),
});
const decodeOEmbedResponse = Schema.decodeUnknownEffect(OEmbedResponse);

function isLikelyVideoUrl(url: URL): boolean {
  if (url.hostname === "youtu.be") return true;
  const path = url.pathname;
  if (path === "/watch") return url.searchParams.has("v");
  if (path.startsWith("/shorts/")) return true;
  if (path === "/playlist") return url.searchParams.has("list");
  if (path.startsWith("/embed/")) return true;
  return false;
}

export const youtubeExtractor: Extractor = {
  name: "youtube",
  authoritative: true,
  extract: (url: URL, context = defaultExtractorContext()) =>
    Effect.gen(function* () {
      if (!isLikelyVideoUrl(url)) return null;

      const oembedUrl = new URL("https://www.youtube.com/oembed");
      oembedUrl.searchParams.set("url", url.toString());
      oembedUrl.searchParams.set("format", "json");

      const response = yield* Effect.tryPromise(() =>
        fetchBoundedText({
          acceptedContentTypes: ["application/json"],
          fetcher: context.fetcher,
          headers: { Accept: "application/json" },
          maxBytes: context.maxBytes,
          maxRedirects: context.maxRedirects,
          signal: context.signal,
          targetSchema: context.targetSchema,
          url: oembedUrl,
        })
      );
      const data = yield* Effect.try(() => JSON.parse(response.body)).pipe(
        Effect.flatMap(decodeOEmbedResponse)
      );
      if (!data.title) return null;

      return {
        title: data.title,
        description: data.author_name ? `by ${data.author_name}` : undefined,
        image: data.thumbnail_url,
        favicon: "https://www.youtube.com/favicon.ico",
      };
    }).pipe(
      Effect.withSpan("extractor.youtube.extract"),
      Effect.catch(() => Effect.succeed(null))
    ),
};
