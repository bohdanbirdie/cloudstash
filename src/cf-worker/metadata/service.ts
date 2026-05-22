/// <reference types="@cloudflare/workers-types" />
import { Effect } from "effect";

import {
  MetadataFetchError,
  MetadataParseError,
  MetadataMissingUrlError,
} from "./errors";
import { tryExtract } from "./extractors";
import { MetadataParser } from "./parser";
import { OgMetadata } from "./schema";

export const fetchOgMetadata = Effect.fn("MetadataService.fetchOgMetadata")(
  function* (targetUrl: string) {
    const parsedUrl = URL.parse(targetUrl);
    yield* Effect.annotateCurrentSpan({
      hostname: parsedUrl?.hostname ?? "",
      url: targetUrl,
    });

    const extracted = parsedUrl ? yield* tryExtract(parsedUrl) : null;

    if (extracted) {
      yield* Effect.annotateCurrentSpan({
        extractor: extracted.extractor,
        extractorAuthoritative: extracted.authoritative,
      });
      yield* Effect.logInfo("Per-host extractor matched").pipe(
        Effect.annotateLogs({
          authoritative: extracted.authoritative,
          extractor: extracted.extractor,
          hostname: parsedUrl?.hostname,
        })
      );
      if (extracted.authoritative) {
        return OgMetadata.make(extracted.result);
      }
    }

    const response = yield* Effect.tryPromise({
      catch: (cause) => MetadataParseError.make({ cause, url: targetUrl }),
      try: () =>
        fetch(targetUrl, {
          headers: {
            Accept: "text/html",
            "User-Agent": "Mozilla/5.0 (compatible; CloudstashBot/1.0)",
          },
        }),
    });

    if (!response.ok) {
      yield* Effect.annotateCurrentSpan({ statusCode: response.status });
      return yield* MetadataFetchError.make({
        statusCode: response.status,
        url: targetUrl,
      });
    }

    const parser = new MetadataParser(targetUrl);

    yield* Effect.tryPromise({
      catch: (cause) => MetadataParseError.make({ cause, url: targetUrl }),
      try: () =>
        new HTMLRewriter()
          .on("title", parser)
          .on("meta", parser)
          .on("link", parser)
          .on("script", parser)
          .transform(response)
          .text(),
    });

    const result = parser.getResult();

    const ext = extracted?.result;
    return OgMetadata.make({
      description: ext?.description ?? result.description,
      favicon:
        ext?.favicon ??
        result.favicon ??
        URL.parse("/favicon.ico", targetUrl)?.href ??
        "/favicon.ico",
      image: ext?.image ?? result.image,
      title: ext?.title ?? result.title,
    });
  }
);

const handleMetadataRequest = Effect.fn(
  "MetadataService.handleMetadataRequest"
)(function* (request: Request) {
  yield* Effect.logInfo("Metadata request received");
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");

  if (!targetUrl) {
    yield* Effect.logWarning("Missing URL parameter");
    return yield* MetadataMissingUrlError.make({});
  }

  yield* Effect.annotateCurrentSpan({ url: targetUrl });

  const metadata = yield* fetchOgMetadata(targetUrl);
  yield* Effect.logInfo("Metadata fetched").pipe(
    Effect.annotateLogs({
      hasDescription: !!metadata.description,
      hasImage: !!metadata.image,
      hasTitle: !!metadata.title,
      hostname: URL.parse(targetUrl)?.hostname,
    })
  );
  return metadata;
});

export const metadataRequestToResponse = (
  request: Request
): Effect.Effect<Response> =>
  handleMetadataRequest(request).pipe(
    Effect.map((metadata) =>
      Response.json(metadata, {
        headers: { "Cache-Control": "public, max-age=86400" },
      })
    ),
    Effect.catchTags({
      MetadataFetchError: (e) =>
        Effect.logInfo("Metadata fetch failed").pipe(
          Effect.annotateLogs({ statusCode: e.statusCode, url: e.url }),
          Effect.as(
            Response.json(
              { error: e.message, statusCode: e.statusCode },
              { status: 502 }
            )
          )
        ),
      MetadataMissingUrlError: (e) =>
        Effect.succeed(Response.json({ error: e.message }, { status: 400 })),
      MetadataParseError: (e) =>
        Effect.logWarning("Metadata parse failed").pipe(
          Effect.annotateLogs({ cause: String(e.cause), url: e.url }),
          Effect.as(Response.json({ error: e.message }, { status: 500 }))
        ),
    })
  );
