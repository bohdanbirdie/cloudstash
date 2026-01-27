/// <reference types="@cloudflare/workers-types" />
import { Effect, Schema } from "effect";

import {
  MetadataFetchError,
  MetadataParseError,
  MissingUrlError,
} from "./errors";
import { MetadataParser } from "./parser";
import { OgMetadata, ResolvedUrl } from "./schema";

export const fetchOgMetadata = Effect.fn("fetchOgMetadata")(
  function* fetchOgMetadata(targetUrl: string) {
    const response = yield* Effect.tryPromise({
      catch: (error) =>
        MetadataParseError.make({
          error,
          url: targetUrl,
        }),
      try: () =>
        fetch(targetUrl, {
          headers: {
            Accept: "text/html",
            "User-Agent": "Mozilla/5.0 (compatible; CloudstashBot/1.0)",
          },
        }),
    });

    if (!response.ok) {
      return yield* MetadataFetchError.make({
        statusCode: response.status,
        url: targetUrl,
      });
    }

    const parser = new MetadataParser(targetUrl);

    yield* Effect.tryPromise({
      catch: (error) =>
        MetadataParseError.make({
          error,
          url: targetUrl,
        }),
      try: () =>
        new HTMLRewriter()
          .on("title", parser)
          .on("meta", parser)
          .on("link", parser)
          .transform(response)
          .text(),
    });

    const favicon =
      parser.favicon ??
      Schema.decodeUnknownSync(ResolvedUrl(targetUrl))("/favicon.ico");

    return OgMetadata.make({
      description: parser.description,
      favicon,
      image: parser.image,
      title: parser.title,
      url: parser.ogUrl,
    });
  }
);

export const handleMetadataRequest = Effect.fn("handleMetadataRequest")(
  function* handleMetadataRequest(request: Request) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) {
      return yield* MissingUrlError.make({});
    }

    return yield* fetchOgMetadata(targetUrl);
  }
);

export const metadataRequestToResponse = (
  request: Request
): Effect.Effect<Response, never, never> =>
  handleMetadataRequest(request).pipe(
    Effect.map((metadata) =>
      Response.json(metadata, {
        headers: {
          "Cache-Control": "public, max-age=86400",
        },
      })
    ),
    Effect.catchTags({
      MetadataFetchError: (e) =>
        Effect.succeed(
          Response.json(
            { error: `Failed to fetch URL: ${e.statusCode}` },
            {
              status: 502,
            }
          )
        ),
      MetadataParseError: () =>
        Effect.succeed(
          Response.json({ error: "Failed to parse metadata" }, { status: 500 })
        ),
      MissingUrlError: () =>
        Effect.succeed(
          Response.json({ error: "Missing url parameter" }, { status: 400 })
        ),
    })
  );
