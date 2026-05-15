import { Effect, Layer, Match, Schedule } from "effect";

import { safeErrorInfo } from "../../log-utils";
import { fetchAndExtractContent } from "../content-extractor";
import { ContentExtractionError, ContentExtractorFailure } from "../errors";
import { ContentExtractor } from "../services";

export const ContentExtractorLive = Layer.succeed(ContentExtractor, {
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
      try: () => fetchAndExtractContent(url),
    }).pipe(
      Effect.timeout("15 seconds"),
      Effect.retry({
        schedule: Schedule.exponential("300 millis").pipe(
          Schedule.compose(Schedule.recurs(2))
        ),
        while: (error) =>
          Match.value(error).pipe(
            Match.tag("TimeoutException", () => true),
            Match.tag("ContentExtractionError", (e) => e.reason === "unknown"),
            Match.exhaustive
          ),
      }),
      Effect.catchAll((error) =>
        Effect.logWarning("Content extraction failed").pipe(
          Effect.annotateLogs({
            ...safeErrorInfo(error),
            reason:
              error._tag === "ContentExtractionError" ? error.reason : "other",
          }),
          Effect.as(null)
        )
      ),
      Effect.withSpan("ContentExtractor.extract", {
        attributes: { url },
      })
    ),
});
