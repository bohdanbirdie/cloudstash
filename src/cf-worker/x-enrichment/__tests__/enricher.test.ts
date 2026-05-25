import { Effect, Either, Layer } from "effect";
import { describe, expect, it } from "vitest";

import { OrgId, XTweetId, XUsername } from "../../db/branded";
import { enrichSummary } from "../enricher";
import { EnrichmentGenerateError, ThreadProviderEmptyError } from "../errors";
import { EnrichmentGenerator } from "../generator";
import { ThreadProvider } from "../services";
import type { ThreadContext } from "../services";
import { ENRICHMENT_MODEL, MONTHLY_ENRICHMENT_CAP } from "../types";
import { EnrichmentUsage } from "../usage";

const STORE_ID = OrgId.make("org-fixture-1");
const URL = "https://x.com/alice/status/1810000000000000001";

const baseContext: ThreadContext = {
  root: {
    id: XTweetId.make("1810000000000000001"),
    text: "main body of tweet",
    authorScreenName: XUsername.make("alice"),
    authorName: "Alice",
    createdAt: null,
    quotedText: null,
    quotedAuthorScreenName: null,
    inReplyToId: null,
    conversationId: XTweetId.make("1810000000000000001"),
    externalUrls: [],
  },
  authorContinuations: [],
  isReply: false,
};

interface CallLog {
  events: string[];
}

const FakeUsageLive = (initialUsed: number, log: CallLog) =>
  Layer.succeed(EnrichmentUsage, {
    current: () =>
      Effect.sync(() => {
        log.events.push("usage.current");
        return { used: initialUsed, period: "2026-05" };
      }),
    increment: () =>
      Effect.sync(() => {
        log.events.push("usage.increment");
        return { used: initialUsed + 1, period: "2026-05" };
      }),
  });

const FakeProviderLive = (
  ctx: ThreadContext | Effect.Effect<never, ThreadProviderEmptyError>,
  log: CallLog
) =>
  Layer.succeed(ThreadProvider, {
    fetchContext: () => {
      log.events.push("provider.fetch");
      return Effect.isEffect(ctx) ? ctx : Effect.succeed(ctx);
    },
  });

const FakeGeneratorLive = (
  output:
    | { summary: string; suggestedTags: string[] }
    | Effect.Effect<never, EnrichmentGenerateError>,
  log: CallLog
) =>
  Layer.succeed(
    EnrichmentGenerator,
    new EnrichmentGenerator({
      generate: () => {
        log.events.push("generator.generate");
        return Effect.isEffect(output)
          ? output
          : (Effect.succeed(output) as Effect.Effect<
              typeof output,
              EnrichmentGenerateError
            >);
      },
    })
  );

describe("enrichSummary orchestrator", () => {
  it("returns EnrichmentBudgetExhaustedError at the cap — no fetch / no generate", async () => {
    const log: CallLog = { events: [] };
    const layer = Layer.mergeAll(
      FakeUsageLive(MONTHLY_ENRICHMENT_CAP, log),
      FakeProviderLive(baseContext, log),
      FakeGeneratorLive({ summary: "nope", suggestedTags: [] }, log)
    );

    const result = await Effect.runPromise(
      Effect.either(
        enrichSummary({ storeId: STORE_ID, url: URL, existingTags: [] }).pipe(
          Effect.provide(layer)
        )
      )
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("EnrichmentBudgetExhaustedError");
      expect(result.left).toMatchObject({
        storeId: STORE_ID,
        used: MONTHLY_ENRICHMENT_CAP,
        cap: MONTHLY_ENRICHMENT_CAP,
      });
    }
    expect(log.events).toEqual(["usage.current"]);
  });

  it("happy path: checks budget, fetches context, generates, increments — returns {summary, suggestedTags}", async () => {
    const log: CallLog = { events: [] };
    const layer = Layer.mergeAll(
      FakeUsageLive(7, log),
      FakeProviderLive(baseContext, log),
      FakeGeneratorLive(
        { summary: "enriched summary text", suggestedTags: ["ai", "rust"] },
        log
      )
    );

    const result = await Effect.runPromise(
      enrichSummary({
        storeId: STORE_ID,
        url: URL,
        existingTags: [{ name: "ai" }],
      }).pipe(Effect.provide(layer))
    );

    expect(result).toEqual({
      summary: "enriched summary text",
      suggestedTags: ["ai", "rust"],
    });
    expect(log.events).toEqual([
      "usage.current",
      "provider.fetch",
      "generator.generate",
      "usage.increment",
    ]);
  });

  it("provider failure: no generator call, no usage increment (budget not consumed)", async () => {
    const log: CallLog = { events: [] };
    const layer = Layer.mergeAll(
      FakeUsageLive(3, log),
      FakeProviderLive(
        Effect.fail(
          new ThreadProviderEmptyError({
            url: URL,
            tweetId: XTweetId.make("1810000000000000001"),
          })
        ),
        log
      ),
      FakeGeneratorLive({ summary: "never reached", suggestedTags: [] }, log)
    );

    const result = await Effect.runPromise(
      Effect.either(
        enrichSummary({ storeId: STORE_ID, url: URL, existingTags: [] }).pipe(
          Effect.provide(layer)
        )
      )
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("ThreadProviderEmptyError");
    }
    expect(log.events).toEqual(["usage.current", "provider.fetch"]);
  });

  it("generator failure: no usage increment (budget not consumed)", async () => {
    const log: CallLog = { events: [] };
    const layer = Layer.mergeAll(
      FakeUsageLive(0, log),
      FakeProviderLive(baseContext, log),
      FakeGeneratorLive(
        Effect.fail(
          new EnrichmentGenerateError({
            model: ENRICHMENT_MODEL,
            cause: new Error("openrouter 500"),
          })
        ),
        log
      )
    );

    const result = await Effect.runPromise(
      Effect.either(
        enrichSummary({ storeId: STORE_ID, url: URL, existingTags: [] }).pipe(
          Effect.provide(layer)
        )
      )
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toMatchObject({
        _tag: "EnrichmentGenerateError",
        model: ENRICHMENT_MODEL,
      });
    }
    expect(log.events).toEqual([
      "usage.current",
      "provider.fetch",
      "generator.generate",
    ]);
  });
});
