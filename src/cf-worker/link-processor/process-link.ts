import { nanoid } from "@livestore/livestore";
import { Cause, Effect } from "effect";

import { isValidTagName, sanitizeTagName } from "@/lib/tags";

import { events } from "../../livestore/schema";
import type { LinkId } from "../db/branded";
import { safeErrorInfo } from "../log-utils";
import { findMatchingTag } from "./fuzzy-match";
import {
  AiSummaryGenerator,
  ContentExtractor,
  LinkEventStore,
  MetadataFetcher,
} from "./services";
import { AI_MODEL } from "./types";

interface ProcessLinkParams {
  aiSummaryEnabled?: boolean;
  link: { id: LinkId; url: string };
  skipStartedEvent?: boolean;
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
  link,
  skipStartedEvent = false,
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

    const metadataResult = yield* metadataFetcher.fetch(link.url);

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

      const result = yield* aiGenerator.generate({
        existingTags,
        extractedContent,
        metadata: metadataResult,
        url: link.url,
      });

      if (result.summary) {
        yield* linkStore.commit(
          events.linkSummarized({
            id: nanoid(),
            linkId: link.id,
            model: AI_MODEL,
            summarizedAt: new Date(),
            summary: result.summary,
          })
        );
        yield* Effect.logInfo("Summary generated").pipe(
          Effect.annotateLogs({
            model: AI_MODEL,
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
