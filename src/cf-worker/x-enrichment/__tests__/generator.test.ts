import { Effect, Result } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { XTweetId, XUsername } from "../../db/branded";
import { composePrompt, EnrichmentGenerator } from "../generator";
import type { GenerateEnrichmentCompletion } from "../generator";
import type { ThreadContext } from "../services";
import { ENRICHMENT_MODEL } from "../types";

const baseRoot: ThreadContext["root"] = {
  id: XTweetId.make("1"),
  text: "main body",
  authorScreenName: XUsername.make("alice"),
  authorName: "Alice",
  createdAt: null,
  quotedText: null,
  quotedAuthorScreenName: null,
  inReplyToId: null,
  conversationId: XTweetId.make("1"),
  externalUrls: [],
};

describe("composePrompt", () => {
  it("labels standalone posts when there are no continuations and not a reply", () => {
    const out = composePrompt({
      url: "https://x.com/alice/status/1",
      context: { root: baseRoot, authorContinuations: [], isReply: false },
      existingTags: [],
    });
    expect(out).toContain("URL: https://x.com/alice/status/1");
    expect(out).toContain("Author: @alice");
    expect(out).toContain("Type: standalone post");
    expect(out).toContain("Bookmarked tweet:");
    expect(out).toContain("main body");
  });

  it("labels thread starters when continuations follow", () => {
    const out = composePrompt({
      url: "https://x.com/alice/status/1",
      context: {
        root: baseRoot,
        authorContinuations: [
          { ...baseRoot, id: XTweetId.make("2"), text: "second part" },
        ],
        isReply: false,
      },
      existingTags: [],
    });
    expect(out).toContain("Type: thread starter (continuations below)");
  });

  it("labels reply tweets explicitly", () => {
    const out = composePrompt({
      url: "https://x.com/alice/status/2",
      context: {
        root: { ...baseRoot, inReplyToId: XTweetId.make("1") },
        authorContinuations: [],
        isReply: true,
      },
      existingTags: [],
    });
    expect(out).toContain("Type: reply (inside a larger conversation)");
  });

  it("folds quoted-tweet body with the quoted author handle", () => {
    const out = composePrompt({
      url: "https://x.com/alice/status/1",
      context: {
        root: {
          ...baseRoot,
          quotedText: "original take",
          quotedAuthorScreenName: XUsername.make("bob"),
        },
        authorContinuations: [],
        isReply: false,
      },
      existingTags: [],
    });
    expect(out).toContain("Quoting @bob:");
    expect(out).toContain("original take");
  });

  it("falls back to 'another tweet' when quoted handle is missing", () => {
    const out = composePrompt({
      url: "https://x.com/alice/status/1",
      context: {
        root: {
          ...baseRoot,
          quotedText: "anonymous quote",
          quotedAuthorScreenName: null,
        },
        authorContinuations: [],
        isReply: false,
      },
      existingTags: [],
    });
    expect(out).toContain("Quoting another tweet:");
  });

  it("appends author continuation bullets with the count", () => {
    const out = composePrompt({
      url: "https://x.com/alice/status/1",
      context: {
        root: baseRoot,
        authorContinuations: [
          { ...baseRoot, id: XTweetId.make("2"), text: "second part" },
          { ...baseRoot, id: XTweetId.make("3"), text: "third part" },
        ],
        isReply: false,
      },
      existingTags: [],
    });
    expect(out).toContain("Author thread continuation (2):");
    expect(out).toContain("- second part");
    expect(out).toContain("- third part");
  });

  it("omits the continuation section entirely when empty", () => {
    const out = composePrompt({
      url: "https://x.com/alice/status/1",
      context: { root: baseRoot, authorContinuations: [], isReply: false },
      existingTags: [],
    });
    expect(out).not.toContain("Author thread continuation");
  });

  it("omits the Author line when authorScreenName is null", () => {
    const out = composePrompt({
      url: "https://x.com/_/status/1",
      context: {
        root: { ...baseRoot, authorScreenName: null },
        authorContinuations: [],
        isReply: false,
      },
      existingTags: [],
    });
    expect(out).not.toContain("Author:");
  });

  it("includes an <existing-tags> vocabulary block when tags are provided", () => {
    const out = composePrompt({
      url: "https://x.com/alice/status/1",
      context: { root: baseRoot, authorContinuations: [], isReply: false },
      existingTags: [{ name: "ai" }, { name: "rust" }, { name: "infra" }],
    });
    expect(out).toContain("<existing-tags>ai, rust, infra</existing-tags>");
  });

  it("omits the <existing-tags> block entirely when no tags are provided", () => {
    const out = composePrompt({
      url: "https://x.com/alice/status/1",
      context: { root: baseRoot, authorContinuations: [], isReply: false },
      existingTags: [],
    });
    expect(out).not.toContain("existing-tags");
  });
});

describe("EnrichmentGenerator", () => {
  const complete = vi.fn<GenerateEnrichmentCompletion>();
  const generatorLayer = EnrichmentGenerator.layer(complete);

  const params = {
    url: "https://x.com/alice/status/1",
    context: { root: baseRoot, authorContinuations: [], isReply: false },
    existingTags: [],
  };

  beforeEach(() => {
    complete.mockReset();
  });

  it("returns the parsed {summary, suggestedTags} on success", async () => {
    complete.mockResolvedValueOnce({
      object: { summary: "model output", suggestedTags: ["ai", "rust"] },
      usage: { inputTokens: 100, outputTokens: 20 },
    });

    const result = await Effect.runPromise(
      EnrichmentGenerator.pipe(
        Effect.flatMap((g) => g.generate(params)),
        Effect.provide(generatorLayer)
      )
    );
    expect(result).toEqual({
      summary: "model output",
      suggestedTags: ["ai", "rust"],
    });
    expect(complete).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith(expect.stringContaining("main body"));
  });

  it("wraps a throwing AI call as EnrichmentGenerateError with model + promptChars", async () => {
    const underlying = new Error("openrouter 500");
    complete.mockRejectedValueOnce(underlying);

    const result = await Effect.runPromise(
      Effect.result(
        EnrichmentGenerator.pipe(
          Effect.flatMap((g) => g.generate(params)),
          Effect.provide(generatorLayer)
        )
      )
    );

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure._tag).toBe("EnrichmentGenerateError");
      expect(result.failure.model).toBe(ENRICHMENT_MODEL);
      expect(result.failure.promptChars).toBeGreaterThan(0);
      expect(result.failure.cause).toBe(underlying);
    }
  });
});
