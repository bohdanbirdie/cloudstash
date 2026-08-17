import type { Effect } from "effect";

import { HttpTargetUrl } from "../../net/bounded-fetch";

export interface ExtractedMetadata {
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
}

export interface Extractor {
  name: string;
  /**
   * If true, the extractor's result is canonical and the HTML fetch is skipped.
   * If false, the HTML pipeline runs and OG fields fill in gaps the extractor
   * didn't provide (extractor wins on any field it populated).
   */
  authoritative: boolean;
  extract: (
    url: URL,
    context?: ExtractorContext
  ) => Effect.Effect<ExtractedMetadata | null>;
}

export interface ExtractorContext {
  readonly fetcher: typeof fetch;
  readonly maxBytes: number;
  readonly maxRedirects: number;
  readonly signal: AbortSignal;
  readonly targetSchema: ReturnType<typeof HttpTargetUrl>;
}

export const defaultExtractorContext = (): ExtractorContext => ({
  fetcher: fetch,
  maxBytes: 5_000_000,
  maxRedirects: 5,
  signal: AbortSignal.timeout(9_000),
  targetSchema: HttpTargetUrl(),
});

export interface ExtractorMatch {
  extractor: string;
  authoritative: boolean;
  result: ExtractedMetadata;
}
