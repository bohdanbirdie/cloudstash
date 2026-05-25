import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { Array as Arr, Effect } from "effect";
import { z } from "zod";

import { MAX_TAG_NAME_LENGTH } from "@/lib/tags";

import { OpenRouterApiKey } from "../weekly-digest/generator";
import { EnrichmentGenerateError } from "./errors";
import type { ThreadContext } from "./services";
import { ENRICHMENT_MODEL } from "./types";

const SYSTEM_PROMPT = `You write a short, faithful summary AND suggest 1–2 tags for an X (Twitter) post.

Summary rules:
- 2–4 sentences. Max 80 words. Stay this short even when extra thread context is provided — that context is there to make the summary more accurate, not longer.
- Every fact, link, name, and number in your summary must appear in the input. Do not infer or extrapolate.
- Be specific: name the topic, the claim, and (if present) the most important external link by URL.
- If the post quotes another tweet, reflect both sides honestly — don't conflate.
- If the post is the start of a thread, capture the through-line of the author's continuation, not every bullet.
- If the post is a reply, frame it as a response inside a larger conversation.
- No "the author tweets that…", no preamble, no closing flourish. Plain prose.

Tag rules:
- Suggest 1–2 tags total.
- If an existing tag fits well, reuse it. Otherwise create a new one.
- Use lowercase, hyphenated format (e.g. "react-hooks"). Each tag at most ${MAX_TAG_NAME_LENGTH} characters.
- Prefer short, broad categories over long phrases.`;

export const enrichmentOutputSchema = z.object({
  summary: z
    .string()
    .min(10)
    .max(600)
    .describe(
      "2–4 sentence faithful summary of the X post. Plain prose, no preamble."
    ),
  suggestedTags: z
    .array(z.string())
    .max(2)
    .describe(
      `1-2 relevant tags in lowercase hyphenated format (e.g. react-hooks). Each tag at most ${MAX_TAG_NAME_LENGTH} characters.`
    ),
});

export type EnrichmentOutput = z.infer<typeof enrichmentOutputSchema>;

export interface ComposePromptInput {
  readonly url: string;
  readonly context: ThreadContext;
  readonly existingTags: ReadonlyArray<{ readonly name: string }>;
}

export function composePrompt({
  url,
  context,
  existingTags,
}: ComposePromptInput): string {
  const { root, authorContinuations, isReply } = context;
  const typeLabel = isReply
    ? "Type: reply (inside a larger conversation)"
    : authorContinuations.length > 0
      ? "Type: thread starter (continuations below)"
      : "Type: standalone post";
  const header = [
    `URL: ${url}`,
    root.authorScreenName ? `Author: @${root.authorScreenName}` : null,
    typeLabel,
  ].filter((line): line is string => line !== null);

  const body = ["Bookmarked tweet:", root.text];

  const quoted = root.quotedText
    ? [
        `Quoting ${
          root.quotedAuthorScreenName
            ? `@${root.quotedAuthorScreenName}`
            : "another tweet"
        }:`,
        root.quotedText,
      ]
    : [];

  const continuations =
    authorContinuations.length > 0
      ? [
          `Author thread continuation (${authorContinuations.length}):`,
          ...Arr.map(authorContinuations, (t) => `- ${t.text}`),
        ]
      : [];

  const tagVocab =
    existingTags.length > 0
      ? [
          `<existing-tags>${existingTags.map((t) => t.name).join(", ")}</existing-tags>`,
        ]
      : [];

  const sections = [header.join("\n"), body.join("\n")];
  if (quoted.length > 0) sections.push(quoted.join("\n"));
  if (continuations.length > 0) sections.push(continuations.join("\n"));
  if (tagVocab.length > 0) sections.push(tagVocab.join("\n"));
  return sections.join("\n\n");
}

export interface EnrichmentGenerateParams {
  readonly url: string;
  readonly context: ThreadContext;
  readonly existingTags: ReadonlyArray<{ readonly name: string }>;
}

export class EnrichmentGenerator extends Effect.Service<EnrichmentGenerator>()(
  "@cloudstash/EnrichmentGenerator",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const apiKey = yield* OpenRouterApiKey;
      const openrouter = createOpenRouter({ apiKey });
      const model = openrouter(ENRICHMENT_MODEL);

      const generate = Effect.fn("EnrichmentGenerator.generate")(function* (
        params: EnrichmentGenerateParams
      ) {
        yield* Effect.annotateCurrentSpan({
          model: ENRICHMENT_MODEL,
          isReply: params.context.isReply,
          authorContinuations: params.context.authorContinuations.length,
          existingTagCount: params.existingTags.length,
        });

        const prompt = composePrompt(params);
        const promptChars = prompt.length;
        yield* Effect.annotateCurrentSpan("promptChars", promptChars);

        const result = yield* Effect.tryPromise({
          try: () =>
            generateObject({
              experimental_telemetry: { isEnabled: true },
              maxOutputTokens: 512,
              model,
              prompt,
              schema: enrichmentOutputSchema,
              system: SYSTEM_PROMPT,
            }),
          catch: (cause) =>
            new EnrichmentGenerateError({
              model: ENRICHMENT_MODEL,
              promptChars,
              cause,
            }),
        });

        const inputTokens = result.usage?.inputTokens ?? 0;
        const outputTokens = result.usage?.outputTokens ?? 0;
        yield* Effect.annotateCurrentSpan({
          inputTokens,
          outputTokens,
          summaryLength: result.object.summary.length,
          suggestedTagsCount: result.object.suggestedTags.length,
        });

        return result.object;
      });

      return { generate };
    }),
  }
) {}
