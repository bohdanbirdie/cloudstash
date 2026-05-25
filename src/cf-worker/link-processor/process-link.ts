import { nanoid } from "@livestore/livestore";
import { Cause, Effect } from "effect";

import { isValidTagName, sanitizeTagName } from "@/lib/tags";

import { events } from "../../livestore/schema";
import type { LinkId, OrgId } from "../db/branded";
import { safeErrorInfo } from "../log-utils";
import { enrichSummary } from "../x-enrichment/enricher";
import { ENRICHMENT_MODEL, isXTweetUrl } from "../x-enrichment/types";
import { findMatchingTag } from "./fuzzy-match";
import {
  AiSummaryGenerator,
  ContentExtractor,
  LinkEventStore,
  MetadataFetcher,
} from "./services";
import { AI_MODEL } from "./types";

const unboundedSemaphore = Effect.unsafeMakeSemaphore(Number.MAX_SAFE_INTEGER);

interface ProcessLinkParams {
  aiSummaryEnabled?: boolean;
  xContentEnrichmentEnabled?: boolean;
  storeId?: OrgId;
  link: { id: LinkId; url: string };
  skipStartedEvent?: boolean;
  metadataSemaphore?: Effect.Semaphore;
  aiSemaphore?: Effect.Semaphore;
}

interface RecordFailureParams {
  error: string;
  errorTag: string;
  logLevel: "warning" | "error";
  logMessage: string;
  annotations: Record<string, unknown>;
}

export const processLink = ({
  aiSummaryEnabled = false,
  xContentEnrichmentEnabled = false,
  storeId,
  link,
  skipStartedEvent = false,
  metadataSemaphore = unboundedSemaphore,
  aiSemaphore = unboundedSemaphore,
}: ProcessLinkParams) => {
  const recordFailure = ({
    error,
    errorTag,
    logLevel,
    logMessage,
    annotations,
  }: RecordFailureParams) =>
    Effect.gen(function* () {
      const linkStore = yield* LinkEventStore;
      yield* Effect.annotateCurrentSpan({ errorTag, ...annotations });
      const log = logLevel === "error" ? Effect.logError : Effect.logWarning;
      yield* log(logMessage).pipe(
        Effect.annotateLogs({ errorTag, ...annotations })
      );
      yield* linkStore.commit(
        events.linkProcessingFailed({
          error,
          linkId: link.id,
          updatedAt: new Date(),
        })
      );
    });

  return Effect.gen(function* () {
    const metadataFetcher = yield* MetadataFetcher;
    const contentExtractor = yield* ContentExtractor;
    const aiGenerator = yield* AiSummaryGenerator;
    const linkStore = yield* LinkEventStore;

    const now = new Date();

    yield* Effect.logInfo("Processing link started");

    if (!skipStartedEvent) {
      yield* linkStore.commit(
        events.linkProcessingStarted({ linkId: link.id, updatedAt: now })
      );
    }

    const metadataResult = yield* metadataFetcher
      .fetch(link.url)
      .pipe(
        metadataSemaphore.withPermits(1),
        Effect.withSpan("LinkProcessor.fetchMetadata")
      );

    const hasAnyMetadata =
      !!metadataResult.title ||
      !!metadataResult.description ||
      !!metadataResult.image ||
      !!metadataResult.favicon;

    if (hasAnyMetadata) {
      yield* linkStore.commit(
        events.linkMetadataFetched({
          description: metadataResult.description ?? null,
          favicon: metadataResult.favicon ?? null,
          fetchedAt: now,
          id: nanoid(),
          image: metadataResult.image ?? null,
          linkId: link.id,
          title: metadataResult.title ?? null,
        })
      );
      yield* Effect.logInfo("Metadata fetched").pipe(
        Effect.annotateLogs({
          hasDescription: !!metadataResult.description,
          hasFavicon: !!metadataResult.favicon,
          hasImage: !!metadataResult.image,
          hasTitle: !!metadataResult.title,
        })
      );
    } else {
      yield* Effect.logWarning("Metadata fetched but empty").pipe(
        Effect.annotateLogs({ url: link.url })
      );
    }

    if (aiSummaryEnabled) {
      const existingTags = yield* linkStore.queryTags();

      const summarizeBasic = Effect.gen(function* () {
        const extractedContent = yield* contentExtractor.extract(link.url);

        if (extractedContent) {
          yield* Effect.logInfo("Content extracted").pipe(
            Effect.annotateLogs({
              contentLength: extractedContent.content.length,
              hasTitle: !!extractedContent.title,
            })
          );
        } else {
          yield* Effect.logWarning("No content extracted");
        }

        const basic = yield* aiGenerator.generate({
          existingTags,
          extractedContent,
          metadata: metadataResult,
          url: link.url,
        });
        return { ...basic, model: AI_MODEL };
      });

      const canEnrich =
        xContentEnrichmentEnabled &&
        storeId !== undefined &&
        isXTweetUrl(link.url);

      const fallbackToBasic = (
        message: string,
        fields: Record<string, unknown>
      ) =>
        Effect.logWarning(message).pipe(
          Effect.annotateLogs(fields),
          Effect.zipRight(summarizeBasic)
        );

      const summarize = canEnrich
        ? enrichSummary({ storeId, url: link.url, existingTags }).pipe(
            Effect.map((enriched) => ({
              summary: enriched.summary as string | null,
              suggestedTags: enriched.suggestedTags,
              model: ENRICHMENT_MODEL,
            })),
            Effect.catchTags({
              EnrichmentBudgetExhaustedError: (e) =>
                Effect.logInfo(
                  "Enrichment budget exhausted, falling back to basic"
                ).pipe(
                  Effect.annotateLogs({
                    period: e.period,
                    used: e.used,
                    cap: e.cap,
                  }),
                  Effect.zipRight(summarizeBasic)
                ),
              ThreadProviderInvalidUrlError: (e) =>
                fallbackToBasic("Enrichment provider: invalid url", {
                  providerUrl: e.url,
                }),
              ThreadProviderTransportError: (e) =>
                fallbackToBasic("Enrichment provider: transport", {
                  providerUrl: e.url,
                  ...safeErrorInfo(e.cause),
                }),
              ThreadProviderHttpError: (e) =>
                fallbackToBasic("Enrichment provider: http", {
                  providerUrl: e.url,
                  providerStatus: e.status,
                  tweetId: e.tweetId ?? null,
                }),
              ThreadProviderResponseError: (e) =>
                fallbackToBasic("Enrichment provider: bad response", {
                  providerUrl: e.url,
                  tweetId: e.tweetId ?? null,
                  ...safeErrorInfo(e.cause),
                }),
              ThreadProviderEmptyError: (e) =>
                fallbackToBasic("Enrichment provider: empty tweet text", {
                  providerUrl: e.url,
                  tweetId: e.tweetId,
                }),
              ThreadProviderTimeoutError: (e) =>
                fallbackToBasic("Enrichment provider: timeout", {
                  providerUrl: e.url,
                  tweetId: e.tweetId ?? null,
                }),
              EnrichmentGenerateError: (e) =>
                fallbackToBasic("Enrichment generator failed", {
                  model: e.model,
                  promptChars: e.promptChars ?? null,
                  ...safeErrorInfo(e.cause),
                }),
              EnrichmentUsageGetError: (e) =>
                fallbackToBasic("Enrichment usage KV read failed", {
                  period: e.period,
                  ...safeErrorInfo(e.cause),
                }),
              EnrichmentUsagePutError: (e) =>
                fallbackToBasic("Enrichment usage KV write failed", {
                  period: e.period,
                  ...safeErrorInfo(e.cause),
                }),
            })
          )
        : summarizeBasic;

      const result = yield* summarize.pipe(
        aiSemaphore.withPermits(1),
        Effect.withSpan("LinkProcessor.aiSummarize", {
          attributes: { canEnrich },
        })
      );

      if (result.summary) {
        yield* linkStore.commit(
          events.linkSummarized({
            id: nanoid(),
            linkId: link.id,
            model: result.model,
            summarizedAt: new Date(),
            summary: result.summary,
          })
        );
        yield* Effect.logInfo("Summary generated").pipe(
          Effect.annotateLogs({
            model: result.model,
            summaryLength: result.summary.length,
          })
        );
      } else {
        yield* Effect.logWarning("No summary generated");
      }

      const existingLinkTagNames = yield* linkStore.queryLinkTagNames(link.id);
      const existingNameSet = new Set(
        existingLinkTagNames.map((n) => n.toLowerCase())
      );

      const newSuggestions = result.suggestedTags
        .map((s) => sanitizeTagName(s))
        .filter((suggestion) => {
          const matchedTag = findMatchingTag(suggestion, existingTags);
          const name = matchedTag?.name ?? suggestion;
          if (!matchedTag && !isValidTagName(suggestion)) return false;
          return !existingNameSet.has(name.toLowerCase());
        });

      yield* Effect.forEach(
        newSuggestions,
        (suggestion) => {
          const matchedTag = findMatchingTag(suggestion, existingTags);
          return linkStore.commit(
            events.tagSuggested({
              id: nanoid(),
              linkId: link.id,
              model: AI_MODEL,
              suggestedAt: new Date(),
              suggestedName: matchedTag?.name ?? suggestion,
              tagId: matchedTag?.id ?? null,
            })
          );
        },
        { discard: true }
      );

      if (newSuggestions.length > 0) {
        yield* Effect.logInfo("Tag suggestions emitted").pipe(
          Effect.annotateLogs({
            count: newSuggestions.length,
            skipped: result.suggestedTags.length - newSuggestions.length,
          })
        );
      }
    } else {
      yield* Effect.logDebug("AI summaries disabled, skipping");
    }

    yield* linkStore.commit(
      events.linkProcessingCompleted({
        linkId: link.id,
        updatedAt: new Date(),
      })
    );

    yield* Effect.logInfo("Link processing completed");
  }).pipe(
    Effect.withSpan("LinkProcessor.processLink", {
      attributes: { aiSummaryEnabled, linkId: link.id },
    }),
    Effect.annotateLogs({ linkId: link.id }),
    Effect.catchTags({
      AiCallError: (error) =>
        recordFailure({
          error: "AiCallError",
          errorTag: "AiCallError",
          logLevel: "error",
          logMessage: "Link processing failed",
          annotations: { url: error.url, ...safeErrorInfo(error.cause) },
        }),
      MetadataFetchError: (error) =>
        recordFailure({
          error: `fetch:${error.statusCode}`,
          errorTag: "MetadataFetchError",
          logLevel: "warning",
          logMessage: "Link processing failed: metadata fetch",
          annotations: { statusCode: error.statusCode, url: error.url },
        }),
      MetadataParseError: (error) =>
        recordFailure({
          error: "fetch:unreadable",
          errorTag: "MetadataParseError",
          logLevel: "warning",
          logMessage: "Link processing failed: metadata parse",
          annotations: { cause: String(error.cause), url: error.url },
        }),
      TimeoutException: () =>
        recordFailure({
          error: "fetch:timeout",
          errorTag: "TimeoutException",
          logLevel: "warning",
          logMessage: "Link processing failed: timeout",
          annotations: { url: link.url },
        }),
    }),
    Effect.catchAllDefect((defect) =>
      recordFailure({
        error: "Defect",
        errorTag: "Defect",
        logLevel: "error",
        logMessage: "Link processing failed with defect",
        annotations: { defect: Cause.pretty(Cause.die(defect)) },
      })
    )
  );
};
