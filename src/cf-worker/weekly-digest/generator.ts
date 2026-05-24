import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { Context, Effect, Layer, Schema } from "effect";

import { weeklyDigestGenerateErrorFromAiSdk } from "./errors";

export const MODEL_ID = "google/gemini-3.1-flash-lite";

const SYSTEM_PROMPT = `You write a short weekly digest for a user of Cloudstash, a personal link-saving app.

Rules:
- 2–4 sentences total. Max 70 words of prose (URLs do not count toward the limit).
- No headings, no bullet lists, no preamble.
- Synthesize what the week was about — don't just list what was saved.
- Reference 2–3 of the most important saves by pasting their bare URL inline (exactly as provided). Do NOT wrap the URLs in markdown brackets or parentheses. The reader's app renders each URL as a clickable chip showing the article's title, so write the surrounding prose as if the URL itself is the article's title (e.g. "you read https://example.com/post about X" reads as "you read [Post Title] about X").
- Plain prose. No "Here's your digest", no "Based on your saves", no closing flourish.`;

export const DigestLinkInput = Schema.Struct({
  title: Schema.String,
  url: Schema.String,
  domain: Schema.String,
  summary: Schema.String,
  tags: Schema.Array(Schema.String),
});
export type DigestLinkInput = Schema.Schema.Type<typeof DigestLinkInput>;

export interface WeeklyDigestParams {
  readonly links: ReadonlyArray<DigestLinkInput>;
  readonly generatedAt: Date;
}

export class OpenRouterApiKey extends Context.Tag(
  "@cloudstash/OpenRouterApiKey"
)<OpenRouterApiKey, string>() {}

export const OpenRouterApiKeyLive = (apiKey: string) =>
  Layer.succeed(OpenRouterApiKey, apiKey);

export function formatLinks(input: ReadonlyArray<DigestLinkInput>): string {
  return input
    .map(
      (l, i) =>
        `${i + 1}. "${l.title}" — ${l.url}\n   tags: ${l.tags.join(", ")}\n   ${l.summary}`
    )
    .join("\n\n");
}

export class WeeklyDigestGenerator extends Effect.Service<WeeklyDigestGenerator>()(
  "@cloudstash/WeeklyDigestGenerator",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const apiKey = yield* OpenRouterApiKey;
      const openrouter = createOpenRouter({ apiKey });
      const model = openrouter(MODEL_ID);

      const generate = Effect.fn("WeeklyDigestGenerator.generate")(function* (
        params: WeeklyDigestParams
      ) {
        const { links, generatedAt } = params;
        yield* Effect.annotateCurrentSpan("linkCount", links.length);
        yield* Effect.annotateCurrentSpan("model", MODEL_ID);
        yield* Effect.annotateCurrentSpan(
          "generatedAt",
          generatedAt.toISOString()
        );

        const userPrompt = `The user's saves this week:\n\n${formatLinks(links)}`;

        const result = yield* Effect.tryPromise({
          catch: weeklyDigestGenerateErrorFromAiSdk({
            linkCount: links.length,
            model: MODEL_ID,
          }),
          try: () =>
            generateText({
              experimental_telemetry: { isEnabled: true },
              model,
              prompt: userPrompt,
              system: SYSTEM_PROMPT,
            }),
        });

        const inputTokens = result.usage?.inputTokens ?? 0;
        const outputTokens = result.usage?.outputTokens ?? 0;
        yield* Effect.annotateCurrentSpan("inputTokens", inputTokens);
        yield* Effect.annotateCurrentSpan("outputTokens", outputTokens);

        return result.text;
      });

      return { generate };
    }),
  }
) {}
