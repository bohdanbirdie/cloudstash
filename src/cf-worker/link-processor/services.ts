import { Context, type Effect } from "effect";

import { type events } from "../../livestore/schema";
import { type OgMetadata } from "../metadata/schema";
import { type ExtractedContent } from "./content-extractor";

type EventCreators = typeof events;
export type StoreEvent = {
  [K in keyof EventCreators]: ReturnType<EventCreators[K]>;
}[keyof EventCreators];

export class MetadataFetcher extends Context.Tag("MetadataFetcher")<
  MetadataFetcher,
  { readonly fetch: (url: string) => Effect.Effect<OgMetadata | null> }
>() {}

export class ContentExtractor extends Context.Tag("ContentExtractor")<
  ContentExtractor,
  { readonly extract: (url: string) => Effect.Effect<ExtractedContent | null> }
>() {}

export interface GenerateSummaryResult {
  summary: string | null;
  suggestedTags: string[];
}

export interface GenerateParams {
  url: string;
  metadata: { title?: string; description?: string } | null;
  extractedContent: ExtractedContent | null;
  existingTags: readonly { readonly id: string; readonly name: string }[];
}

export class AiSummaryGenerator extends Context.Tag("AiSummaryGenerator")<
  AiSummaryGenerator,
  {
    readonly generate: (
      params: GenerateParams
    ) => Effect.Effect<GenerateSummaryResult>;
  }
>() {}

export class WorkersAi extends Context.Tag("WorkersAi")<WorkersAi, Ai>() {}

export class LinkEventStore extends Context.Tag("LinkEventStore")<
  LinkEventStore,
  {
    readonly commit: (event: StoreEvent) => Effect.Effect<void>;
    readonly queryTags: () => Effect.Effect<
      readonly { readonly id: string; readonly name: string }[]
    >;
  }
>() {}
