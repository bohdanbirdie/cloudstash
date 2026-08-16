import { Effect, Layer, Match, Schedule } from "effect";

import { MetadataFetchError } from "../../metadata/errors";
import { fetchOgMetadata } from "../../metadata/service";
import { MetadataFetcher } from "../services";

export const MetadataFetcherLive = (
  ownHostname: string,
  fetcher: typeof fetch = fetch
) =>
  Layer.succeed(MetadataFetcher, {
    fetch: (url) =>
      fetchOgMetadata(url, { fetcher, ownHostname }).pipe(
        Effect.catchTag("MetadataInvalidTargetError", () =>
          Effect.fail(new MetadataFetchError({ reason: "target-rejected" }))
        ),
        Effect.timeout("10 seconds"),
        Effect.retry({
          schedule: Schedule.exponential("200 millis").pipe(
            Schedule.upTo({ times: 2 })
          ),
          while: (error) =>
            Match.value(error).pipe(
              Match.tag("TimeoutError", () => true),
              Match.tag(
                "MetadataFetchError",
                (failure) =>
                  failure.reason === "timeout" ||
                  failure.reason === "unknown" ||
                  failure.statusCode === 429 ||
                  (failure.statusCode !== undefined &&
                    failure.statusCode >= 500)
              ),
              Match.tag("MetadataParseError", () => false),
              Match.exhaustive
            ),
        }),
        Effect.withSpan("MetadataFetcher.fetch")
      ),
  });
