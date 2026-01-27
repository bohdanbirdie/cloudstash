import { nanoid } from "@livestore/livestore";
import { Effect } from "effect";

import { events } from "../../livestore/schema";
import { fetchOgMetadata } from "../metadata/service";
import { type Env } from "../shared";
import { fetchAndExtractContent } from "./content-extractor";
import { generateSummary } from "./generate-summary";
import { AI_MODEL, type LinkStore } from "./types";

interface ProcessLinkParams {
  link: { id: string; url: string };
  store: LinkStore;
  env: Env;
  isRetry?: boolean; // true if retrying a stuck link
}

/**
 * Process a single link: fetch metadata, extract content, generate AI summary
 */
export const processLink = ({
  link,
  store,
  env,
  isRetry = false,
}: ProcessLinkParams) =>
  Effect.gen(function* processLink() {
    const now = new Date();

    yield* Effect.logInfo(
      `Processing link ${isRetry ? "(retry)" : "started"}`
    ).pipe(Effect.annotateLogs({ isRetry, url: link.url }));

    // Mark as processing started (only for new links, not retries)
    if (!isRetry) {
      store.commit(
        events.linkProcessingStarted({ linkId: link.id, updatedAt: now })
      );
    }

    // Fetch metadata
    yield* Effect.logDebug("Fetching metadata");
    const metadataResult = yield* fetchOgMetadata(link.url).pipe(
      Effect.catchAll((error) =>
        Effect.logWarning("Metadata fetch failed").pipe(
          Effect.annotateLogs({ error: String(error) }),
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
      yield* Effect.logInfo("Metadata fetched and committed").pipe(
        Effect.annotateLogs({
          hasDescription: !!metadataResult.description,
          hasImage: !!metadataResult.image,
          title: metadataResult.title,
        })
      );
    } else {
      yield* Effect.logWarning("No metadata result");
    }

    // Extract page content for AI summary
    yield* Effect.logDebug("Extracting content");
    const extractedContent = yield* Effect.tryPromise({
      catch: (error) => new Error(`Content extraction failed: ${error}`),
      try: () => fetchAndExtractContent(link.url),
    }).pipe(
      Effect.catchAll((error) =>
        Effect.logWarning("Content extraction failed").pipe(
          Effect.annotateLogs({ error: String(error) }),
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

    // Generate AI summary
    yield* Effect.logDebug("Generating AI summary");
    const summaryContent = yield* generateSummary({
      env,
      extractedContent,
      metadata: metadataResult,
      url: link.url,
    });

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
      yield* Effect.logInfo("Summary generated and committed").pipe(
        Effect.annotateLogs({
          summaryLength: summaryContent.length,
          summaryPreview: summaryContent.slice(0, 100),
        })
      );
    } else {
      yield* Effect.logWarning("No summary generated");
    }

    // Mark as completed
    store.commit(
      events.linkProcessingCompleted({ linkId: link.id, updatedAt: new Date() })
    );

    yield* Effect.logInfo("Link processing completed");
  }).pipe(
    Effect.annotateLogs({ linkId: link.id }),
    Effect.catchAllCause((cause) =>
      Effect.gen(function* processLink() {
        const errorMessage = cause.toString();
        yield* Effect.logError("Link processing failed").pipe(
          Effect.annotateLogs({ error: errorMessage })
        );
        store.commit(
          events.linkProcessingFailed({
            error: errorMessage,
            linkId: link.id,
            updatedAt: new Date(),
          })
        );
      })
    )
  );
