import { nanoid } from "@livestore/livestore";
import { Effect } from "effect";

import { events } from "../../livestore/schema";
import { safeErrorInfo } from "../log-utils";
import { fetchOgMetadata } from "../metadata/service";
import { type Env } from "../shared";
import { fetchAndExtractContent } from "./content-extractor";
import { generateSummary } from "./generate-summary";
import { AI_MODEL, type LinkStore } from "./types";

interface ProcessLinkParams {
  aiSummaryEnabled?: boolean;
  env: Env;
  isRetry?: boolean; // true if retrying a stuck link
  link: { id: string; url: string };
  store: LinkStore;
}

/**
 * Process a single link: fetch metadata, extract content, generate AI summary
 */
export const processLink = ({
  aiSummaryEnabled = false,
  env,
  isRetry = false,
  link,
  store,
}: ProcessLinkParams) =>
  Effect.gen(function* () {
    const now = new Date();

    yield* Effect.logInfo(
      `Processing link ${isRetry ? "(retry)" : "started"}`
    ).pipe(Effect.annotateLogs({ isRetry }));

    // Mark as processing started (only for new links, not retries)
    if (!isRetry) {
      store.commit(
        events.linkProcessingStarted({ linkId: link.id, updatedAt: now })
      );
    }

    // Fetch metadata
    const metadataResult = yield* fetchOgMetadata(link.url).pipe(
      Effect.withSpan("fetchMetadata"),
      Effect.catchAll((error) =>
        Effect.logWarning("Metadata fetch failed").pipe(
          Effect.annotateLogs(safeErrorInfo(error)),
          Effect.as(null)
        )
      )
    );

    if (metadataResult) {
      store.commit(
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
      const extractedContent = yield* Effect.tryPromise({
        catch: (error) => new Error(`Content extraction failed: ${error}`),
        try: () => fetchAndExtractContent(link.url),
      }).pipe(
        Effect.withSpan("extractContent"),
        Effect.catchAll((error) =>
          Effect.logWarning("Content extraction failed").pipe(
            Effect.annotateLogs(safeErrorInfo(error)),
            Effect.as(null)
          )
        )
      );

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

      const summaryContent = yield* generateSummary({
        env,
        extractedContent,
        metadata: metadataResult,
        url: link.url,
      }).pipe(Effect.withSpan("generateSummary"));

      if (summaryContent) {
        store.commit(
          events.linkSummarized({
            id: nanoid(),
            linkId: link.id,
            model: AI_MODEL,
            summarizedAt: new Date(),
            summary: summaryContent,
          })
        );
        yield* Effect.logInfo("Summary generated").pipe(
          Effect.annotateLogs({
            model: AI_MODEL,
            summaryLength: summaryContent.length,
          })
        );
      } else {
        yield* Effect.logWarning("No summary generated");
      }
    } else {
      yield* Effect.logDebug("AI summaries disabled, skipping");
    }

    store.commit(
      events.linkProcessingCompleted({ linkId: link.id, updatedAt: new Date() })
    );

    yield* Effect.logInfo("Link processing completed");
  }).pipe(
    Effect.annotateLogs({ linkId: link.id }),
    Effect.withSpan("processLink", {
      attributes: { aiSummaryEnabled, isRetry, linkId: link.id },
    }),
    Effect.catchAllCause((cause) =>
      Effect.gen(function* () {
        const errorInfo = safeErrorInfo(cause);
        yield* Effect.logError("Link processing failed").pipe(
          Effect.annotateLogs(errorInfo)
        );
        store.commit(
          events.linkProcessingFailed({
            error: errorInfo.errorType,
            linkId: link.id,
            updatedAt: new Date(),
          })
        );
      })
    )
  );
