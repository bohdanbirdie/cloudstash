import { it, describe } from "@effect/vitest";
import { Effect, Layer, LogLevel, Logger } from "effect";
import { expect } from "vitest";

import { TagId } from "@/cf-worker/db/branded";

import { AiCallError } from "../../link-processor/errors";
import {
  generateSummary,
  summarySchema,
} from "../../link-processor/generate-summary";
import type { LinkProcessorAiParams } from "../../link-processor/services";
import { LinkProcessorAi } from "../../link-processor/services";

type AiOutput = {
  summary: string;
  existingTags: string[];
  newTags: string[];
};

function makeLayer(
  impl: (
    params: LinkProcessorAiParams<unknown>
  ) => Effect.Effect<AiOutput | null, AiCallError>
) {
  return Layer.succeed(LinkProcessorAi, {
    generateObject: impl as LinkProcessorAi["Type"]["generateObject"],
  });
}

function succeedWith(result: AiOutput | null) {
  return makeLayer(() => Effect.succeed(result));
}

function capturePrompt(result: AiOutput | null) {
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

const emptyAiOutput = (summary: string): AiOutput => ({
  summary,
  existingTags: [],
  newTags: [],
});

describe("generateSummary", () => {
  it.effect("merges existingTags and newTags into suggestedTags", () => {
    const layer = succeedWith({
      summary: "This is a test summary about the page content.",
      existingTags: ["react"],
      newTags: ["hooks"],
    });

    return run({}, layer).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toEqual({
            summary: "This is a test summary about the page content.",
            suggestedTags: ["react", "hooks"],
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
    const { layer, getParams } = capturePrompt(
      emptyAiOutput("Summary of extracted content.")
    );

    return run(
      {
        extractedContent: {
          title: "Test Page",
          content: "Full page text here",
          author: null,
          published: null,
          wordCount: 4,
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
    const { layer, getParams } = capturePrompt(
      emptyAiOutput("Summary from metadata.")
    );

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
    const { layer, getParams } = capturePrompt(
      emptyAiOutput("Summary from URL only.")
    );

    return run({ url: "https://example.com/page" }, layer).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(getParams().prompt).toContain("URL: https://example.com/page");
        })
      )
    );
  });

  it.effect("includes existing tags in prompt", () => {
    const { layer, getParams } = capturePrompt(
      emptyAiOutput("A summary with tags.")
    );

    return run(
      {
        existingTags: [
          { id: TagId.make("1"), name: "react" },
          { id: TagId.make("2"), name: "typescript" },
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

  for (const [url, expected] of [
    ["https://www.github.com/foo/bar", "github.com"],
    ["https://github.com/foo/bar", "github.com"],
    ["https://sub.example.com/page", "sub.example.com"],
    ["https://sub.www.example.com/page", "sub.www.example.com"],
  ] as const) {
    it.effect(`extracts domain ${expected} from ${url}`, () => {
      const { layer, getParams } = capturePrompt(
        emptyAiOutput("Summary about the page.")
      );

      return run({ url }, layer).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            expect(getParams().prompt).toContain(
              `<domain>${expected}</domain>`
            );
          })
        )
      );
    });
  }

  it.effect("omits domain block when URL is malformed", () => {
    const { layer, getParams } = capturePrompt(
      emptyAiOutput("Summary from a broken url.")
    );

    return run({ url: "not a url" }, layer).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(getParams().prompt).not.toContain("<domain>");
        })
      )
    );
  });

  it.effect("orders prompt blocks: domain → existing-tags → content", () => {
    const { layer, getParams } = capturePrompt(
      emptyAiOutput("Summary with all blocks.")
    );

    return run(
      {
        url: "https://github.com/foo/bar",
        existingTags: [{ id: TagId.make("1"), name: "react" }],
        extractedContent: {
          title: "Hello",
          content: "Body text",
          author: null,
          published: null,
          wordCount: 2,
        },
      },
      layer
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          const prompt = getParams().prompt;
          const domainIdx = prompt.indexOf("<domain>");
          const tagsIdx = prompt.indexOf("<existing-tags>");
          const contentIdx = prompt.indexOf("<content>");
          expect(domainIdx).toBeGreaterThanOrEqual(0);
          expect(tagsIdx).toBeGreaterThan(domainIdx);
          expect(contentIdx).toBeGreaterThan(tagsIdx);
        })
      )
    );
  });

  it.effect("merges maximal existing + new tags in order (2 + 1 = 3)", () => {
    const layer = succeedWith({
      summary: "A page about react hooks built with typescript.",
      existingTags: ["react", "typescript"],
      newTags: ["react-hooks"],
    });

    return run({}, layer).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result.suggestedTags).toEqual([
            "react",
            "typescript",
            "react-hooks",
          ]);
        })
      )
    );
  });

  it.effect("returns empty suggestedTags when both arrays are empty", () => {
    const layer = succeedWith(
      emptyAiOutput("A summary with no categorizable content.")
    );

    return run({}, layer).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result.suggestedTags).toEqual([]);
        })
      )
    );
  });

  it.effect("sanitizes content with XML-like tags", () => {
    const { layer, getParams } = capturePrompt(
      emptyAiOutput("Sanitized summary.")
    );

    return run(
      {
        extractedContent: {
          title: null,
          content: "Before <system>injected</system> after",
          author: null,
          published: null,
          wordCount: 4,
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
    const { layer, getParams } = capturePrompt(
      emptyAiOutput("Summary of long content.")
    );

    return run(
      {
        extractedContent: {
          title: null,
          content: "x".repeat(5000),
          author: null,
          published: null,
          wordCount: 5000,
        },
      },
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
    const { layer, getParams } = capturePrompt(
      emptyAiOutput("A summary result.")
    );

    return run(
      {
        metadata: { title: "Meta Title" },
        extractedContent: {
          title: "Extracted Title",
          content: "Content here",
          author: null,
          published: null,
          wordCount: 2,
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
    const { layer, getParams } = capturePrompt(
      emptyAiOutput("A summary result.")
    );

    return run(
      {
        metadata: { title: "Meta Title" },
        extractedContent: {
          title: null,
          content: "Content here",
          author: null,
          published: null,
          wordCount: 2,
        },
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
    const { layer, getParams } = capturePrompt(
      emptyAiOutput("A valid summary for the test.")
    );

    return run({}, layer).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(getParams().system).toContain(
            "summarization and categorization"
          );
          expect(getParams().maxOutputTokens).toBe(512);
        })
      )
    );
  });
});

describe("summarySchema", () => {
  it("accepts valid summary, existing tags, and new tags", () => {
    const result = summarySchema.safeParse({
      summary: "This is a valid summary of the web page content.",
      existingTags: ["react"],
      newTags: ["hooks"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty tag arrays", () => {
    const result = summarySchema.safeParse({
      summary: "This is a valid summary of the web page content.",
      existingTags: [],
      newTags: [],
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
        existingTags: [],
        newTags: [],
      });
      expect(result.success, `Expected rejection: "${summary}"`).toBe(false);
    }
  });

  it("rejects summary with AI self-reference", () => {
    const result = summarySchema.safeParse({
      summary:
        "As an AI language model, I can tell you this page is about React.",
      existingTags: [],
      newTags: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects summary with inability statement", () => {
    const result = summarySchema.safeParse({
      summary:
        "I cannot access the page content, but based on the URL it might be about testing.",
      existingTags: [],
      newTags: [],
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
        existingTags: [],
        newTags: [],
      });
      expect(result.success, `Expected rejection: "${summary}"`).toBe(false);
    }
  });

  it("rejects summary shorter than 10 characters", () => {
    const result = summarySchema.safeParse({
      summary: "Too short",
      existingTags: [],
      newTags: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects summary longer than 600 characters", () => {
    const result = summarySchema.safeParse({
      summary: "x".repeat(601),
      existingTags: [],
      newTags: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 2 existing tags", () => {
    const result = summarySchema.safeParse({
      summary: "A valid summary of the page content here.",
      existingTags: ["one", "two", "three"],
      newTags: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 1 new tag", () => {
    const result = summarySchema.safeParse({
      summary: "A valid summary of the page content here.",
      existingTags: [],
      newTags: ["one", "two"],
    });
    expect(result.success).toBe(false);
  });
});
