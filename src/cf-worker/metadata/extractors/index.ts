import { Effect } from "effect";

import { githubExtractor } from "./github";
import { twitterExtractor } from "./twitter";
import type { Extractor, ExtractorMatch } from "./types";
import { youtubeExtractor } from "./youtube";

const EXTRACTORS: Record<string, Extractor> = {
  "github.com": githubExtractor,
  "twitter.com": twitterExtractor,
  "x.com": twitterExtractor,
  "youtu.be": youtubeExtractor,
  "youtube.com": youtubeExtractor,
};

export function findExtractor(url: URL): Extractor | null {
  const host = url.hostname.replace(/^(www|m|mobile)\./, "");
  return EXTRACTORS[host] ?? null;
}

export const tryExtract = Effect.fn("metadata.tryExtract")(function* (
  url: URL
) {
  const extractor = findExtractor(url);
  if (!extractor) return null;
  yield* Effect.annotateCurrentSpan({ extractor: extractor.name });
  const result = yield* extractor.extract(url).pipe(
    Effect.tapErrorCause((cause) =>
      Effect.logWarning("Extractor defect").pipe(
        Effect.annotateLogs({
          cause: String(cause),
          extractor: extractor.name,
        })
      )
    ),
    Effect.catchAllCause(() => Effect.succeed(null))
  );
  if (!result) return null;
  return {
    authoritative: extractor.authoritative,
    extractor: extractor.name,
    result,
  } satisfies ExtractorMatch;
});
