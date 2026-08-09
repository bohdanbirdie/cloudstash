import { Context } from "effect";
import type { Effect, Cause } from "effect";
import type { ZodType } from "zod";

import type { TierCapabilities } from "@/lib/plan";

import type { events, tables } from "../../livestore/schema";
import type { LinkId, OrgId, TagId } from "../db/branded";
import type {
  MetadataFetchError,
  MetadataParseError,
} from "../metadata/errors";
import type { OgMetadata } from "../metadata/schema";
import type { ExtractedContent } from "./content-extractor";
import type { AiCallError } from "./errors";

export type MetadataFetchFailure =
  | MetadataFetchError
  | MetadataParseError
  | Cause.TimeoutError;

type EventCreators = typeof events;
export type StoreEvent = {
  [K in keyof EventCreators]: ReturnType<EventCreators[K]>;
}[keyof EventCreators];

export type Link = typeof tables.links.Type;
export type Status = typeof tables.linkProcessingStatus.Type;

export class MetadataFetcher extends Context.Service<
  MetadataFetcher,
  {
    readonly fetch: (
      url: string
    ) => Effect.Effect<OgMetadata, MetadataFetchFailure>;
  }
>()("MetadataFetcher") {}

export class ContentExtractor extends Context.Service<
  ContentExtractor,
  { readonly extract: (url: string) => Effect.Effect<ExtractedContent | null> }
>()("ContentExtractor") {}

export interface GenerateSummaryResult {
  summary: string | null;
  suggestedTags: string[];
}

export interface GenerateParams {
  url: string;
  metadata: { title?: string; description?: string } | null;
  extractedContent: ExtractedContent | null;
  existingTags: readonly { readonly id: TagId; readonly name: string }[];
}

export class AiSummaryGenerator extends Context.Service<
  AiSummaryGenerator,
  {
    readonly generate: (
      params: GenerateParams
    ) => Effect.Effect<GenerateSummaryResult, AiCallError>;
  }
>()("AiSummaryGenerator") {}

export class WorkersAi extends Context.Service<WorkersAi, Ai>()("WorkersAi") {}

export interface LinkProcessorAiParams<T> {
  system: string;
  prompt: string;
  schema: ZodType<T>;
  maxOutputTokens: number;
}

export class LinkProcessorAi extends Context.Service<
  LinkProcessorAi,
  {
    readonly generateObject: <T>(
      params: LinkProcessorAiParams<T>
    ) => Effect.Effect<T | null, AiCallError>;
  }
>()("LinkProcessorAi") {}

export class LinkEventStore extends Context.Service<
  LinkEventStore,
  {
    readonly commit: (event: StoreEvent) => Effect.Effect<void>;
    readonly queryTags: () => Effect.Effect<
      readonly { readonly id: TagId; readonly name: string }[]
    >;
    readonly queryLinkTagNames: (
      linkId: LinkId
    ) => Effect.Effect<readonly string[]>;
  }
>()("LinkEventStore") {}

export interface SourceContext {
  source: string | null;
  sourceMeta: string | null;
}

export interface NotifyPayload {
  processingStatus: "completed" | "failed";
  summary: string | null;
  suggestedTags: string[];
}

export class SourceNotifier extends Context.Service<
  SourceNotifier,
  {
    readonly streamProgress: (
      ctx: SourceContext,
      text: string
    ) => Effect.Effect<void>;
    readonly finalizeProgress: (
      ctx: SourceContext,
      payload: NotifyPayload
    ) => Effect.Effect<void>;
    readonly reply: (ctx: SourceContext, text: string) => Effect.Effect<void>;
  }
>()("SourceNotifier") {}

export class FeatureStore extends Context.Service<
  FeatureStore,
  {
    readonly getCapabilities: (
      storeId: OrgId
    ) => Effect.Effect<TierCapabilities>;
  }
>()("FeatureStore") {}

export class LinkRepository extends Context.Service<
  LinkRepository,
  {
    readonly findByUrl: (url: string) => Effect.Effect<Link | null>;
    readonly queryActiveLinks: () => Effect.Effect<Link[]>;
    readonly queryStatuses: () => Effect.Effect<Status[]>;
    readonly commitEvent: (event: StoreEvent) => Effect.Effect<void>;
  }
>()("LinkRepository") {}
