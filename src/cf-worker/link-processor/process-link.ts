import { nanoid } from "@livestore/livestore";
import { Cause, Effect } from "effect";

import { events } from "../../livestore/schema";
import type { LinkId } from "../db/branded";
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

export const processLink = ({
  aiSummaryEnabled = false,
  link,
  skipStartedEvent = false,
}: ProcessLinkParams) =>
  Effect.gen(function* () {
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

    if (metadataResult) {
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
      yield* Effect.logWarning("No metadata result");
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

      const newSuggestions = result.suggestedTags.filter((suggestion) => {
        const matchedTag = findMatchingTag(suggestion, existingTags);
        const name = matchedTag?.name ?? suggestion;
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
    Effect.catchTag("AiCallError", (error) =>
      Effect.gen(function* () {
        const linkStore = yield* LinkEventStore;
        yield* Effect.logError("Link processing failed").pipe(
          Effect.annotateLogs({ errorTag: "AiCallError", url: error.url })
        );
        yield* linkStore.commit(
          events.linkProcessingFailed({
            error: "AiCallError",
            linkId: link.id,
            updatedAt: new Date(),
          })
        );
      })
    ),
    Effect.catchAllDefect((defect) =>
      Effect.gen(function* () {
        const linkStore = yield* LinkEventStore;
        yield* Effect.logError("Link processing failed with defect").pipe(
          Effect.annotateLogs({ defect: Cause.pretty(Cause.die(defect)) })
        );
        yield* linkStore.commit(
          events.linkProcessingFailed({
            error: "Defect",
            linkId: link.id,
            updatedAt: new Date(),
          })
        );
      })
    )
  );
