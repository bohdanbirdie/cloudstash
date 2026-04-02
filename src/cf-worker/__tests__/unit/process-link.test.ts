import { it, describe } from "@effect/vitest";
import { Effect, Layer, LogLevel, Logger } from "effect";
import { expect } from "vitest";

import { LinkId, TagId } from "../../db/branded";
import { AiCallError } from "../../link-processor/errors";
import { processLink } from "../../link-processor/process-link";
import {
  AiSummaryGenerator,
  ContentExtractor,
  LinkEventStore,
  MetadataFetcher,
} from "../../link-processor/services";
import type { StoreEvent } from "../../link-processor/services";

const testLink = { id: LinkId.make("link-1"), url: "https://example.com" };

const mockMetadata = {
  title: "Example",
  description: "A test page",
  favicon: "https://example.com/favicon.ico",
};

function createTestStore(tags: { id: typeof TagId.Type; name: string }[] = []) {
  const committed: StoreEvent[] = [];
  const layer = Layer.succeed(LinkEventStore, {
    commit: (event) =>
      Effect.sync(() => {
        committed.push(event);
      }),
    queryTags: () => Effect.succeed(tags),
  });
  return { layer, committed };
}

function buildTestLayers(
  options: {
    metadata?: {
      title?: string;
      description?: string;
      favicon?: string;
      image?: string;
    } | null;
    content?: { title: string | null; content: string } | null;
    aiResult?: { summary: string | null; suggestedTags: string[] };
    tags?: { id: typeof TagId.Type; name: string }[];
  } = {}
) {
  const store = createTestStore(options.tags);
  const testLayer = Layer.mergeAll(
    Layer.succeed(MetadataFetcher, {
      fetch: () => Effect.succeed(options.metadata ?? null),
    }),
    Layer.succeed(ContentExtractor, {
      extract: () => Effect.succeed(options.content ?? null),
    }),
    Layer.succeed(AiSummaryGenerator, {
      generate: () =>
        Effect.succeed(
          options.aiResult ?? { summary: null, suggestedTags: [] }
        ),
    }),
    store.layer
  );

  return {
    testLayer,
    committed: store.committed,
  };
}

describe("processLink", () => {
  it.effect("fetches metadata and completes", () => {
    const { testLayer, committed } = buildTestLayers({
      metadata: mockMetadata,
    });

    return processLink({ link: testLink }).pipe(
      Effect.provide(testLayer),
      Logger.withMinimumLogLevel(LogLevel.Error),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(committed).toHaveLength(3);
        })
      )
    );
  });

  it.effect("completes without metadata when fetch returns null", () => {
    const { testLayer, committed } = buildTestLayers({ metadata: null });

    return processLink({ link: testLink }).pipe(
      Effect.provide(testLayer),
      Logger.withMinimumLogLevel(LogLevel.Error),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(committed).toHaveLength(2);
        })
      )
    );
  });

  it.effect("skips linkProcessingStarted on retry", () => {
    const { testLayer, committed } = buildTestLayers({
      metadata: mockMetadata,
    });

    return processLink({ link: testLink, isRetry: true }).pipe(
      Effect.provide(testLayer),
      Logger.withMinimumLogLevel(LogLevel.Error),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(committed).toHaveLength(2);
        })
      )
    );
  });

  it.effect("generates summary and suggests tags when AI enabled", () => {
    const { testLayer, committed } = buildTestLayers({
      metadata: mockMetadata,
      content: { title: "Example", content: "Some long content..." },
      aiResult: { summary: "A test summary", suggestedTags: ["test-tag"] },
    });

    return processLink({ link: testLink, aiSummaryEnabled: true }).pipe(
      Effect.provide(testLayer),
      Logger.withMinimumLogLevel(LogLevel.Error),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(committed.length).toBeGreaterThanOrEqual(5);
        })
      )
    );
  });

  it.effect("completes without summary when AI returns null", () => {
    const { testLayer, committed } = buildTestLayers({
      metadata: mockMetadata,
      aiResult: { summary: null, suggestedTags: [] },
    });

    return processLink({ link: testLink, aiSummaryEnabled: true }).pipe(
      Effect.provide(testLayer),
      Logger.withMinimumLogLevel(LogLevel.Error),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(committed).toHaveLength(3);
        })
      )
    );
  });

  it.effect("commits linkProcessingFailed when a service defects", () => {
    const store = createTestStore();
    const testLayer = Layer.mergeAll(
      Layer.succeed(MetadataFetcher, {
        fetch: () => Effect.die("unexpected crash"),
      }),
      Layer.succeed(ContentExtractor, {
        extract: () => Effect.succeed(null),
      }),
      Layer.succeed(AiSummaryGenerator, {
        generate: () => Effect.succeed({ summary: null, suggestedTags: [] }),
      }),
      store.layer
    );

    return processLink({ link: testLink }).pipe(
      Effect.provide(testLayer),
      Logger.withMinimumLogLevel(LogLevel.None),
      Effect.tap(() =>
        Effect.sync(() => {
          const lastEvent = store.committed.at(-1);
          expect(lastEvent).toMatchObject({
            name: "v1.LinkProcessingFailed",
            args: expect.objectContaining({ linkId: "link-1" }),
          });
          expect(store.committed).toHaveLength(2);
        })
      )
    );
  });

  it.effect("matches suggested tags to existing tags", () => {
    const { testLayer, committed } = buildTestLayers({
      metadata: mockMetadata,
      content: { title: "Example", content: "Content..." },
      aiResult: { summary: "A summary", suggestedTags: ["JavaScript"] },
      tags: [{ id: TagId.make("tag-1"), name: "javascript" }],
    });

    return processLink({ link: testLink, aiSummaryEnabled: true }).pipe(
      Effect.provide(testLayer),
      Logger.withMinimumLogLevel(LogLevel.Error),
      Effect.tap(() =>
        Effect.sync(() => {
          const tagEvent = committed.find((e) => e.name === "v1.TagSuggested");
          expect(tagEvent).toMatchObject({
            args: expect.objectContaining({
              tagId: "tag-1",
              suggestedName: "javascript",
            }),
          });
        })
      )
    );
  });

  it.effect("commits linkProcessingFailed when AI service fails", () => {
    const store = createTestStore();
    const testLayer = Layer.mergeAll(
      Layer.succeed(MetadataFetcher, {
        fetch: () => Effect.succeed(mockMetadata),
      }),
      Layer.succeed(ContentExtractor, {
        extract: () => Effect.succeed({ title: "Test", content: "Content" }),
      }),
      Layer.succeed(AiSummaryGenerator, {
        generate: () =>
          Effect.fail(new AiCallError({ cause: "AI unavailable" })),
      }),
      store.layer
    );

    return processLink({ link: testLink, aiSummaryEnabled: true }).pipe(
      Effect.provide(testLayer),
      Logger.withMinimumLogLevel(LogLevel.None),
      Effect.tap(() =>
        Effect.sync(() => {
          const lastEvent = store.committed.at(-1);
          expect(lastEvent).toMatchObject({
            name: "v1.LinkProcessingFailed",
            args: expect.objectContaining({ linkId: "link-1" }),
          });
        })
      )
    );
  });

  it("error escapes when store commit fails in error handler", async () => {
    const testLayer = Layer.mergeAll(
      Layer.succeed(MetadataFetcher, {
        fetch: () => Effect.die("metadata crash"),
      }),
      Layer.succeed(ContentExtractor, {
        extract: () => Effect.succeed(null),
      }),
      Layer.succeed(AiSummaryGenerator, {
        generate: () => Effect.succeed({ summary: null, suggestedTags: [] }),
      }),
      Layer.succeed(LinkEventStore, {
        commit: () => Effect.die("store dead"),
        queryTags: () => Effect.succeed([]),
      })
    );

    await expect(
      Effect.runPromise(
        processLink({ link: testLink }).pipe(
          Effect.provide(testLayer),
          Logger.withMinimumLogLevel(LogLevel.None)
        )
      )
    ).rejects.toThrow("store dead");
  });

  it.effect("emits one tagSuggested per AI suggestion", () => {
    const { testLayer, committed } = buildTestLayers({
      metadata: mockMetadata,
      content: { title: "Example", content: "Content..." },
      aiResult: {
        summary: "A summary",
        suggestedTags: ["react", "typescript", "testing"],
      },
    });

    return processLink({ link: testLink, aiSummaryEnabled: true }).pipe(
      Effect.provide(testLayer),
      Logger.withMinimumLogLevel(LogLevel.Error),
      Effect.tap(() =>
        Effect.sync(() => {
          const tagEvents = committed.filter(
            (e) => e.name === "v1.TagSuggested"
          );
          expect(tagEvents).toHaveLength(3);
        })
      )
    );
  });
});
