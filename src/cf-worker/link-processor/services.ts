import { Context } from "effect";
import type { Effect } from "effect";

import type { events, tables } from "../../livestore/schema";
import type { OrgFeatures } from "../db/schema";
import type { OgMetadata } from "../metadata/schema";
import type { ExtractedContent } from "./content-extractor";
import type { AiCallError } from "./errors";

type EventCreators = typeof events;
export type StoreEvent = {
  [K in keyof EventCreators]: ReturnType<EventCreators[K]>;
}[keyof EventCreators];

export type Link = typeof tables.links.Type;
export type Status = typeof tables.linkProcessingStatus.Type;

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
    ) => Effect.Effect<GenerateSummaryResult, AiCallError>;
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

export class SourceNotifier extends Context.Tag("SourceNotifier")<
  SourceNotifier,
  {
    readonly react: (
      source: string | null,
      sourceMeta: string | null,
      emoji: string
    ) => Effect.Effect<void>;
    readonly reply: (
      source: string | null,
      sourceMeta: string | null,
      text: string
    ) => Effect.Effect<void>;
  }
>() {}

export class FeatureStore extends Context.Tag("FeatureStore")<
  FeatureStore,
  {
    readonly getFeatures: (storeId: string) => Effect.Effect<OrgFeatures>;
  }
>() {}

export class LinkRepository extends Context.Tag("LinkRepository")<
  LinkRepository,
  {
    readonly findByUrl: (url: string) => Effect.Effect<Link | null>;
    readonly queryActiveLinks: () => Effect.Effect<Link[]>;
    readonly queryStatuses: () => Effect.Effect<Status[]>;
    readonly commitEvent: (event: StoreEvent) => Effect.Effect<void>;
  }
>() {}
