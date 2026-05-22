import type { Effect } from "effect";

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
  extract: (url: URL) => Effect.Effect<ExtractedMetadata | null>;
}

export interface ExtractorMatch {
  extractor: string;
  authoritative: boolean;
  result: ExtractedMetadata;
}
