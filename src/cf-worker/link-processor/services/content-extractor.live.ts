import { Effect, Layer, Match, Schedule } from "effect";

import { safeErrorInfo } from "../../log-utils";
import { fetchAndExtractContent } from "../content-extractor";
import { ContentExtractionError, ContentExtractorFailure } from "../errors";
import { ContentExtractor } from "../services";

const EXTRACTION_TIMEOUT = "16 seconds";

export const makeContentExtractorLive = (
  fetcher: typeof fetch = fetch,
  ownHostname?: string
) =>
  Layer.succeed(ContentExtractor, {
    extract: (url) =>
      Effect.tryPromise({
        catch: (cause) => {
          let domain: string;
          try {
            domain = new URL(url).hostname;
          } catch {
            domain = url;
          }
          const reason =
            cause instanceof ContentExtractorFailure ? cause.reason : "unknown";
          return new ContentExtractionError({
            cause,
            message: `Content extraction failed for ${domain}`,
            reason,
            url: domain,
          });
        },
        try: () => fetchAndExtractContent(url, fetcher, ownHostname),
      }).pipe(
        // The inner bounded fetch owns its 15s abort; this is only a backstop.
        Effect.timeout(EXTRACTION_TIMEOUT),
        Effect.retry({
          schedule: Schedule.exponential("300 millis").pipe(
            Schedule.upTo({ times: 2 })
          ),
          while: (error) =>
            Match.value(error).pipe(
              Match.tag("TimeoutError", () => true),
              Match.tag(
                "ContentExtractionError",
                (e) => e.reason === "timeout" || e.reason === "unknown"
              ),
              Match.exhaustive
            ),
        }),
        Effect.catch((error) =>
          Effect.logWarning("Content extraction failed").pipe(
            Effect.annotateLogs({
              ...safeErrorInfo(error),
              reason:
                error._tag === "ContentExtractionError"
                  ? error.reason
                  : "other",
            }),
            Effect.as(null)
          )
        ),
        Effect.withSpan("ContentExtractor.extract")
      ),
  });

export const ContentExtractorLive = (ownHostname: string) =>
  makeContentExtractorLive(fetch, ownHostname);
