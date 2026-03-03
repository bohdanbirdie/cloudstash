import { Effect, Layer, LogLevel, Logger } from "effect";
import { describe, expect, it } from "vitest";

import { AiCallError } from "../../link-processor/errors";
import { processLink } from "../../link-processor/process-link";
import {
  AiSummaryGenerator,
  ContentExtractor,
  LinkEventStore,
  MetadataFetcher,
  type StoreEvent,
} from "../../link-processor/services";

const testLink = { id: "link-1", url: "https://example.com" };

const mockMetadata = {
  title: "Example",
  description: "A test page",
  favicon: "https://example.com/favicon.ico",
};

function createTestStore(tags: { id: string; name: string }[] = []) {
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

function runWithTestLayers(
  params: Parameters<typeof processLink>[0],
  options: {
    metadata?: {
      title?: string;
      description?: string;
      favicon?: string;
      image?: string;
    } | null;
    content?: { title: string | null; content: string } | null;
    aiResult?: { summary: string | null; suggestedTags: string[] };
    tags?: { id: string; name: string }[];
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
    run: () =>
      Effect.runPromise(
        processLink(params).pipe(
          Effect.provide(testLayer),
          Logger.withMinimumLogLevel(LogLevel.Error)
        )
      ),
    committed: store.committed,
  };
}

describe("processLink", () => {
  it("fetches metadata and completes", async () => {
    const { run, committed } = runWithTestLayers(
      { link: testLink },
      { metadata: mockMetadata }
    );
    await run();
    expect(committed).toHaveLength(3);
  });

  it("completes without metadata when fetch returns null", async () => {
    const { run, committed } = runWithTestLayers(
      { link: testLink },
      { metadata: null }
    );
    await run();
    expect(committed).toHaveLength(2);
  });

  it("skips linkProcessingStarted on retry", async () => {
    const { run, committed } = runWithTestLayers(
      { link: testLink, isRetry: true },
      { metadata: mockMetadata }
    );
    await run();
    expect(committed).toHaveLength(2);
  });

  it("generates summary and suggests tags when AI enabled", async () => {
    const { run, committed } = runWithTestLayers(
      { link: testLink, aiSummaryEnabled: true },
      {
        metadata: mockMetadata,
        content: { title: "Example", content: "Some long content..." },
        aiResult: { summary: "A test summary", suggestedTags: ["test-tag"] },
      }
    );
    await run();
    expect(committed.length).toBeGreaterThanOrEqual(5);
  });

  it("completes without summary when AI returns null", async () => {
    const { run, committed } = runWithTestLayers(
      { link: testLink, aiSummaryEnabled: true },
      {
        metadata: mockMetadata,
        aiResult: { summary: null, suggestedTags: [] },
      }
    );
    await run();
    expect(committed).toHaveLength(3);
  });

  it("commits linkProcessingFailed when a service defects", async () => {
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

    await Effect.runPromise(
      processLink({ link: testLink }).pipe(
        Effect.provide(testLayer),
        Logger.withMinimumLogLevel(LogLevel.None)
      )
    );

    const lastEvent = store.committed.at(-1);
    expect(lastEvent).toMatchObject({
      name: "v1.LinkProcessingFailed",
      args: expect.objectContaining({ linkId: "link-1" }),
    });
    expect(store.committed).toHaveLength(2);
  });

  it("matches suggested tags to existing tags", async () => {
    const { run, committed } = runWithTestLayers(
      { link: testLink, aiSummaryEnabled: true },
      {
        metadata: mockMetadata,
        content: { title: "Example", content: "Content..." },
        aiResult: { summary: "A summary", suggestedTags: ["JavaScript"] },
        tags: [{ id: "tag-1", name: "javascript" }],
      }
    );
    await run();

    const tagEvent = committed.find((e) => e.name === "v1.TagSuggested");
    expect(tagEvent).toMatchObject({
      args: expect.objectContaining({
        tagId: "tag-1",
        suggestedName: "javascript",
      }),
    });
  });

  it("commits linkProcessingFailed when AI service fails", async () => {
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

    await Effect.runPromise(
      processLink({ link: testLink, aiSummaryEnabled: true }).pipe(
        Effect.provide(testLayer),
        Logger.withMinimumLogLevel(LogLevel.None)
      )
    );

    const lastEvent = store.committed.at(-1);
    expect(lastEvent).toMatchObject({
      name: "v1.LinkProcessingFailed",
      args: expect.objectContaining({ linkId: "link-1" }),
    });
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

  it("emits one tagSuggested per AI suggestion", async () => {
    const { run, committed } = runWithTestLayers(
      { link: testLink, aiSummaryEnabled: true },
      {
        metadata: mockMetadata,
        content: { title: "Example", content: "Content..." },
        aiResult: {
          summary: "A summary",
          suggestedTags: ["react", "typescript", "testing"],
        },
      }
    );
    await run();

    const tagEvents = committed.filter((e) => e.name === "v1.TagSuggested");
    expect(tagEvents).toHaveLength(3);
  });
});
