import { Effect, Layer, Schedule } from "effect";

import { safeErrorInfo } from "../../log-utils";
import { fetchAndExtractContent } from "../content-extractor";
import { ContentExtractionError } from "../errors";
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
        return new ContentExtractionError({
          cause,
          url: domain,
          message: `Content extraction failed for ${domain}`,
        });
      },
      try: () => fetchAndExtractContent(url),
    }).pipe(
      Effect.timeout("15 seconds"),
      Effect.retry(
        Schedule.exponential("300 millis").pipe(
          Schedule.compose(Schedule.recurs(2))
        )
      ),
      Effect.catchAll((error) =>
        Effect.logWarning("Content extraction failed").pipe(
          Effect.annotateLogs(safeErrorInfo(error)),
          Effect.as(null)
        )
      ),
      Effect.withSpan("ContentExtractor.extract")
    ),
});
