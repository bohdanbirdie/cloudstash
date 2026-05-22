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
      Effect.withSpan("MetadataFetcher.fetch", { attributes: { url } })
    ),
});
