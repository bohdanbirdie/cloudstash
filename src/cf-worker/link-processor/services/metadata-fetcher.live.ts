import { Effect, Layer, Schedule } from "effect";

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
      Effect.catchTags({
        MetadataFetchError: (e) =>
          Effect.logWarning("Metadata fetch failed").pipe(
            Effect.annotateLogs({ statusCode: e.statusCode, url: e.url }),
            Effect.as(null)
          ),
        MetadataParseError: (e) =>
          Effect.logWarning("Metadata parse failed").pipe(
            Effect.annotateLogs({ cause: String(e.cause), url: e.url }),
            Effect.as(null)
          ),
        TimeoutException: () =>
          Effect.logWarning("Metadata fetch timed out").pipe(
            Effect.annotateLogs({ url }),
            Effect.as(null)
          ),
      }),
      Effect.withSpan("MetadataFetcher.fetch", { attributes: { url } })
    ),
});
