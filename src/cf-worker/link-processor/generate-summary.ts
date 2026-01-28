import { Effect } from "effect";

import { safeErrorInfo } from "../log-utils";
import { type Env } from "../shared";
import { type ExtractedContent } from "./content-extractor";
import { AI_MODEL } from "./types";

interface GenerateSummaryParams {
  url: string;
  metadata: { title?: string; description?: string } | null;
  extractedContent: ExtractedContent | null;
  env: Env;
}

/**
 * Generate an AI summary for a link using Workers AI
 */
export const generateSummary = ({
  url,
  metadata,
  extractedContent,
  env,
}: GenerateSummaryParams) =>
  Effect.gen(function* () {
    let content: string;
    let contentSource: string;

    if (extractedContent?.content) {
      const title = extractedContent.title || metadata?.title || "";
      content = title
        ? `# ${title}\n\n${extractedContent.content}`
        : extractedContent.content;
      contentSource = "extracted";
    } else {
      const contentParts: string[] = [`URL: ${url}`];
      if (metadata?.title) {
        contentParts.push(`Title: ${metadata.title}`);
      }
      if (metadata?.description) {
        contentParts.push(`Description: ${metadata.description}`);
      }
      content = contentParts.join("\n");
      contentSource = "metadata";
    }

    const truncatedContent = content.slice(0, 4000);

    yield* Effect.logDebug("Calling Workers AI").pipe(
      Effect.annotateLogs({
        contentLength: truncatedContent.length,
        contentSource,
        model: AI_MODEL,
      })
    );

    const response = yield* Effect.tryPromise({
      catch: (error) => new Error(`AI call failed: ${error}`),
      try: () =>
        env.AI.run(AI_MODEL, {
          max_tokens: 200,
          messages: [
            {
              role: "system",
              content:
                'Summarize web pages in 2-3 sentences. Output ONLY the summary itself - no preamble, no "Here is a summary", no introductory phrases. Start directly with the content.',
            },
            { role: "user", content: truncatedContent },
          ],
        }),
    });

    yield* Effect.logDebug("Workers AI response received").pipe(
      Effect.annotateLogs({
        hasResponse: "response" in response,
        responseType: typeof response,
      })
    );

    if ("response" in response && typeof response.response === "string") {
      const summary = response.response.trim();
      yield* Effect.logDebug("Summary extracted").pipe(
        Effect.annotateLogs({ summaryLength: summary.length })
      );
      return summary;
    }

    yield* Effect.logWarning("Unexpected AI response format");
    return null;
  }).pipe(
    Effect.catchAll((error) =>
      Effect.logError("AI summary generation failed").pipe(
        Effect.annotateLogs(safeErrorInfo(error)),
        Effect.as(null)
      )
    )
  );
