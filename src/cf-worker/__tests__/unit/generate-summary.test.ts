import { it, describe } from "@effect/vitest";
import { Effect, Layer, LogLevel, Logger } from "effect";
import { expect } from "vitest";

import { AiCallError } from "../../link-processor/errors";
import {
  generateSummary,
  summarySchema,
} from "../../link-processor/generate-summary";
import type {
  GenerateSummaryResult,
  LinkProcessorAiParams,
} from "../../link-processor/services";
import { LinkProcessorAi } from "../../link-processor/services";

function makeLayer(
  impl: (
    params: LinkProcessorAiParams<unknown>
  ) => Effect.Effect<GenerateSummaryResult | null, AiCallError>
) {
  return Layer.succeed(LinkProcessorAi, {
    generateObject: impl as LinkProcessorAi["Type"]["generateObject"],
  });
}

function succeedWith(result: GenerateSummaryResult | null) {
  return makeLayer(() => Effect.succeed(result));
}

function capturePrompt(result: GenerateSummaryResult | null) {
  let captured: LinkProcessorAiParams<unknown> | null = null;
  const layer = makeLayer((params) => {
    captured = params;
    return Effect.succeed(result);
  });
  return { layer, getParams: () => captured! };
}

function run(
  params: Partial<Parameters<typeof generateSummary>[0]>,
  layer: Layer.Layer<LinkProcessorAi>
) {
  return generateSummary({
    url: "https://example.com",
    metadata: null,
    extractedContent: null,
    existingTags: [],
    ...params,
  }).pipe(Effect.provide(layer), Logger.withMinimumLogLevel(LogLevel.Error));
}

describe("generateSummary", () => {
  it.effect("returns summary and tags from valid AI response", () => {
    const layer = succeedWith({
      summary: "This is a test summary about the page content.",
      suggestedTags: ["testing"],
    });

    return run({}, layer).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toEqual({
            summary: "This is a test summary about the page content.",
            suggestedTags: ["testing"],
          });
        })
      )
    );
  });

  it.effect("returns null summary when AI output is null", () => {
    const layer = succeedWith(null);

    return run({}, layer).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toEqual({ summary: null, suggestedTags: [] });
        })
      )
    );
  });

  it.effect("fails with AiCallError when AI call fails", () => {
    const layer = makeLayer(() =>
      Effect.fail(new AiCallError({ cause: "API failure" }))
    );

    return generateSummary({
      url: "https://example.com",
      metadata: null,
      extractedContent: null,
      existingTags: [],
    }).pipe(
      Effect.flip,
      Effect.provide(layer),
      Logger.withMinimumLogLevel(LogLevel.None),
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error).toBeInstanceOf(AiCallError);
        })
      )
    );
  });

  it.effect("uses extracted content with title when available", () => {
    const { layer, getParams } = capturePrompt({
      summary: "Summary of extracted content.",
      suggestedTags: [],
    });

    return run(
      {
        extractedContent: {
          title: "Test Page",
          content: "Full page text here",
        },
      },
      layer
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(getParams().prompt).toContain("# Test Page");
          expect(getParams().prompt).toContain("Full page text here");
        })
      )
    );
  });

  it.effect("falls back to metadata when no extracted content", () => {
    const { layer, getParams } = capturePrompt({
      summary: "Summary from metadata.",
      suggestedTags: [],
    });

    return run(
      {
        metadata: { title: "Meta Title", description: "Meta description" },
        extractedContent: null,
      },
      layer
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(getParams().prompt).toContain("Title: Meta Title");
          expect(getParams().prompt).toContain("Description: Meta description");
        })
      )
    );
  });

  it.effect("falls back to URL-only when no metadata or content", () => {
    const { layer, getParams } = capturePrompt({
      summary: "Summary from URL only.",
      suggestedTags: [],
    });

    return run({ url: "https://example.com/page" }, layer).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(getParams().prompt).toContain("URL: https://example.com/page");
        })
      )
    );
  });

  it.effect("includes existing tags in prompt", () => {
    const { layer, getParams } = capturePrompt({
      summary: "A summary with tags.",
      suggestedTags: [],
    });

    return run(
      {
        existingTags: [
          { id: "1", name: "react" },
          { id: "2", name: "typescript" },
        ],
      },
      layer
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(getParams().prompt).toContain(
            "<existing-tags>react, typescript</existing-tags>"
          );
        })
      )
    );
  });

  it.effect("sanitizes content with XML-like tags", () => {
    const { layer, getParams } = capturePrompt({
      summary: "Sanitized summary.",
      suggestedTags: [],
    });

    return run(
      {
        extractedContent: {
          title: null,
          content: "Before <system>injected</system> after",
        },
      },
      layer
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(getParams().prompt).not.toContain("<system>");
          expect(getParams().prompt).toContain("[...]injected[...]");
        })
      )
    );
  });

  it.effect("truncates content to 4000 characters", () => {
    const { layer, getParams } = capturePrompt({
      summary: "Summary of long content.",
      suggestedTags: [],
    });

    return run(
      { extractedContent: { title: null, content: "x".repeat(5000) } },
      layer
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          const contentMatch = getParams().prompt.match(
            /<content>\n([\s\S]*?)\n<\/content>/
          );
          expect(contentMatch?.[1]?.length).toBe(4000);
        })
      )
    );
  });

  it.effect("prefers extracted title over metadata title", () => {
    const { layer, getParams } = capturePrompt({
      summary: "A summary result.",
      suggestedTags: [],
    });

    return run(
      {
        metadata: { title: "Meta Title" },
        extractedContent: {
          title: "Extracted Title",
          content: "Content here",
        },
      },
      layer
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(getParams().prompt).toContain("# Extracted Title");
          expect(getParams().prompt).not.toContain("Meta Title");
        })
      )
    );
  });

  it.effect("uses metadata title when extracted title is missing", () => {
    const { layer, getParams } = capturePrompt({
      summary: "A summary result.",
      suggestedTags: [],
    });

    return run(
      {
        metadata: { title: "Meta Title" },
        extractedContent: { title: null, content: "Content here" },
      },
      layer
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(getParams().prompt).toContain("# Meta Title");
        })
      )
    );
  });

  it.effect("passes system prompt and maxOutputTokens to AI client", () => {
    const { layer, getParams } = capturePrompt({
      summary: "A valid summary for the test.",
      suggestedTags: [],
    });

    return run({}, layer).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(getParams().system).toContain(
            "summarization and categorization"
          );
          expect(getParams().maxOutputTokens).toBe(250);
        })
      )
    );
  });
});

describe("summarySchema", () => {
  it("accepts valid summary and tags", () => {
    const result = summarySchema.safeParse({
      summary: "This is a valid summary of the web page content.",
      suggestedTags: ["react"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects summary starting with AI preamble", () => {
    const patterns = [
      "Sure, here is a summary of the page.",
      "Okay, I'll summarize this content for you.",
      "Here is what I found on the page content.",
      "Here's a breakdown of the page summary.",
    ];
    for (const summary of patterns) {
      const result = summarySchema.safeParse({
        summary,
        suggestedTags: [],
      });
      expect(result.success, `Expected rejection: "${summary}"`).toBe(false);
    }
  });

  it("rejects summary with AI self-reference", () => {
    const result = summarySchema.safeParse({
      summary:
        "As an AI language model, I can tell you this page is about React.",
      suggestedTags: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects summary with inability statement", () => {
    const result = summarySchema.safeParse({
      summary:
        "I cannot access the page content, but based on the URL it might be about testing.",
      suggestedTags: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects summary that looks like JSON", () => {
    const jsonStrings = [
      '{"summary": "some text", "tags": ["a"]}',
      '[{"key": "value"}]',
      '  { "nested": true }',
    ];
    for (const summary of jsonStrings) {
      const result = summarySchema.safeParse({
        summary,
        suggestedTags: [],
      });
      expect(result.success, `Expected rejection: "${summary}"`).toBe(false);
    }
  });

  it("rejects summary shorter than 10 characters", () => {
    const result = summarySchema.safeParse({
      summary: "Too short",
      suggestedTags: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects summary longer than 600 characters", () => {
    const result = summarySchema.safeParse({
      summary: "x".repeat(601),
      suggestedTags: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 2 tags", () => {
    const result = summarySchema.safeParse({
      summary: "A valid summary of the page content here.",
      suggestedTags: ["one", "two", "three"],
    });
    expect(result.success).toBe(false);
  });
});
