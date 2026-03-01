import { Effect, Layer, Schedule } from "effect";

import { safeErrorInfo } from "../../log-utils";
import { fetchOgMetadata } from "../../metadata/service";
import { MetadataFetcher } from "../services";

export const MetadataFetcherLive = Layer.succeed(MetadataFetcher, {
  fetch: (url) =>
    fetchOgMetadata(url).pipe(
      Effect.timeout("10 seconds"),
      Effect.retry(
        Schedule.exponential("200 millis").pipe(
          Schedule.compose(Schedule.recurs(2))
        )
      ),
      Effect.catchAll((error) =>
        Effect.logWarning("Metadata fetch failed").pipe(
          Effect.annotateLogs(safeErrorInfo(error)),
          Effect.as(null)
        )
      ),
      Effect.withSpan("MetadataFetcher.fetch")
    ),
});
