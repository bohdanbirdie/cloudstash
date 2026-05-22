import { Effect } from "effect";

import type { Extractor } from "./types";

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

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
  extract: (url: URL) =>
    Effect.gen(function* () {
      if (!isLikelyVideoUrl(url)) return null;

      const oembedUrl = new URL("https://www.youtube.com/oembed");
      oembedUrl.searchParams.set("url", url.toString());
      oembedUrl.searchParams.set("format", "json");

      const response = yield* Effect.tryPromise(() =>
        fetch(oembedUrl, { headers: { Accept: "application/json" } })
      );
      if (!response.ok) return null;

      const data = (yield* Effect.tryPromise(() =>
        response.json()
      )) as OEmbedResponse;
      if (!data.title) return null;

      return {
        title: data.title,
        description: data.author_name ? `by ${data.author_name}` : undefined,
        image: data.thumbnail_url,
        favicon: "https://www.youtube.com/favicon.ico",
      };
    }).pipe(
      Effect.withSpan("extractor.youtube.extract"),
      Effect.catchAll(() => Effect.succeed(null))
    ),
};
