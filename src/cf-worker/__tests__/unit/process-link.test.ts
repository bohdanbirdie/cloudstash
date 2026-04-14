// @vitest-environment jsdom
import { it, describe, expect, beforeEach, afterEach } from "@effect/vitest";
import { Effect, Layer } from "effect";

import {
  makeTestStore,
  silentLogger,
  testId,
} from "../../../livestore/__tests__/test-helpers";
import type { TestStore } from "../../../livestore/__tests__/test-helpers";
import { events, tables } from "../../../livestore/schema";
import { LinkId, TagId } from "../../db/branded";
import { AiCallError } from "../../link-processor/errors";
import { processLink } from "../../link-processor/process-link";
import {
  AiSummaryGenerator,
  ContentExtractor,
  LinkEventStore,
  MetadataFetcher,
} from "../../link-processor/services";
import { LinkEventStoreLive } from "../../link-processor/services/link-event-store.live";

const testLink = { id: LinkId.make("link-1"), url: "https://example.com" };

const mockMetadata = {
  title: "Example",
  description: "A test page",
  favicon: "https://example.com/favicon.ico",
};

let store: TestStore;

beforeEach(async () => {
  store = await makeTestStore();
  // Seed the link row for every test because processLink operates on a link
  // assumed to already exist in the ingestion pipeline (it's created by
  // ingestLink upstream). The tests below focus on the processing state
  // machine — status / snapshot / summary / tag_suggestion transitions —
  // so having the parent links row present matches production reality and
  // lets assertions read a coherent end state.
  store.commit(
    events.linkCreatedV2({
      id: testLink.id,
      url: testLink.url,
      domain: "example.com",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      source: "test",
      sourceMeta: null,
    })
  );
});

afterEach(async () => {
  await store.shutdownPromise?.();
});

const seedTag = (id: string, name: string) =>
  store.commit(
    events.tagCreated({
      id,
      name,
      sortOrder: 0,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    })
  );

const seedAppliedTag = (linkId: string, tagId: string) =>
  store.commit(
    events.linkTagged({
      id: testId("lt"),
      linkId,
      tagId,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    })
  );

function buildTestLayers(
  options: {
    metadata?: {
      title?: string;
      description?: string;
      favicon?: string;
      image?: string;
    } | null;
    content?: {
      title: string | null;
      content: string;
      author: string | null;
      published: string | null;
      wordCount: number;
    } | null;
    aiResult?: { summary: string | null; suggestedTags: string[] };
  } = {}
) {
  return Layer.mergeAll(
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
    LinkEventStoreLive(store)
  );
}

describe("processLink", () => {
  it.effect("fetches metadata and completes", () =>
    processLink({ link: testLink }).pipe(
      Effect.provide(buildTestLayers({ metadata: mockMetadata })),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          const status = store.query(
            tables.linkProcessingStatus.where({ linkId: testLink.id })
          )[0];
          expect(status.status).toBe("completed");
          expect(
            store.query(tables.linkSnapshots.where({ linkId: testLink.id }))
          ).toHaveLength(1);
          expect(
            store.query(tables.linkSummaries.where({ linkId: testLink.id }))
          ).toHaveLength(0);
        })
      )
    )
  );

  it.effect("completes without metadata when fetch returns null", () =>
    processLink({ link: testLink }).pipe(
      Effect.provide(buildTestLayers({ metadata: null })),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          const status = store.query(
            tables.linkProcessingStatus.where({ linkId: testLink.id })
          )[0];
          expect(status.status).toBe("completed");
          expect(
            store.query(tables.linkSnapshots.where({ linkId: testLink.id }))
          ).toHaveLength(0);
        })
      )
    )
  );

  it.effect("generates summary and suggests tags when AI enabled", () =>
    processLink({ link: testLink, aiSummaryEnabled: true }).pipe(
      Effect.provide(
        buildTestLayers({
          metadata: mockMetadata,
          content: {
            title: "Example",
            content: "Some long content...",
            author: null,
            published: null,
            wordCount: 4,
          },
          aiResult: { summary: "A test summary", suggestedTags: ["test-tag"] },
        })
      ),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          const status = store.query(
            tables.linkProcessingStatus.where({ linkId: testLink.id })
          )[0];
          expect(status.status).toBe("completed");
          expect(
            store.query(tables.linkSnapshots.where({ linkId: testLink.id }))
          ).toHaveLength(1);
          expect(
            store.query(tables.linkSummaries.where({ linkId: testLink.id }))
          ).toHaveLength(1);
          const suggestions = store.query(
            tables.tagSuggestions.where({ linkId: testLink.id })
          );
          expect(suggestions.length).toBeGreaterThanOrEqual(1);
          expect(suggestions[0].suggestedName).toBe("test-tag");
        })
      )
    )
  );

  it.effect("completes without summary when AI returns null", () =>
    processLink({ link: testLink, aiSummaryEnabled: true }).pipe(
      Effect.provide(
        buildTestLayers({
          metadata: mockMetadata,
          aiResult: { summary: null, suggestedTags: [] },
        })
      ),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          const status = store.query(
            tables.linkProcessingStatus.where({ linkId: testLink.id })
          )[0];
          expect(status.status).toBe("completed");
          expect(
            store.query(tables.linkSummaries.where({ linkId: testLink.id }))
          ).toHaveLength(0);
          expect(
            store.query(tables.tagSuggestions.where({ linkId: testLink.id }))
          ).toHaveLength(0);
        })
      )
    )
  );

  it.effect("commits linkProcessingFailed when a service defects", () =>
    processLink({ link: testLink }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(MetadataFetcher, {
            fetch: () => Effect.die("unexpected crash"),
          }),
          Layer.succeed(ContentExtractor, {
            extract: () => Effect.succeed(null),
          }),
          Layer.succeed(AiSummaryGenerator, {
            generate: () =>
              Effect.succeed({ summary: null, suggestedTags: [] }),
          }),
          LinkEventStoreLive(store)
        )
      ),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          const status = store.query(
            tables.linkProcessingStatus.where({ linkId: testLink.id })
          )[0];
          expect(status.status).toBe("failed");
          expect(status.error).toBe("Defect");
        })
      )
    )
  );

  it.effect("matches suggested tags to existing tags", () => {
    seedTag("tag-1", "javascript");
    return processLink({ link: testLink, aiSummaryEnabled: true }).pipe(
      Effect.provide(
        buildTestLayers({
          metadata: mockMetadata,
          content: {
            title: "Example",
            content: "Content...",
            author: null,
            published: null,
            wordCount: 1,
          },
          aiResult: { summary: "A summary", suggestedTags: ["JavaScript"] },
        })
      ),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          const suggestions = store.query(
            tables.tagSuggestions.where({ linkId: testLink.id })
          );
          expect(suggestions).toHaveLength(1);
          expect(suggestions[0].tagId).toBe("tag-1");
          expect(suggestions[0].suggestedName).toBe("javascript");
        })
      )
    );
  });

  it.effect("skips tag suggestions already on the link", () => {
    const reactTagId = TagId.make("tag-react");
    seedTag(reactTagId, "react");
    seedAppliedTag(testLink.id, reactTagId);
    return processLink({ link: testLink, aiSummaryEnabled: true }).pipe(
      Effect.provide(
        buildTestLayers({
          metadata: mockMetadata,
          content: {
            title: "Example",
            content: "Content...",
            author: null,
            published: null,
            wordCount: 1,
          },
          aiResult: {
            summary: "A summary",
            suggestedTags: ["react", "typescript"],
          },
        })
      ),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          const suggestions = store.query(
            tables.tagSuggestions.where({ linkId: testLink.id })
          );
          expect(suggestions).toHaveLength(1);
          expect(suggestions[0].suggestedName).toBe("typescript");
        })
      )
    );
  });

  it.effect("skips tag suggestions case-insensitively", () => {
    const reactTagId = TagId.make("tag-react");
    seedTag(reactTagId, "react");
    seedAppliedTag(testLink.id, reactTagId);
    return processLink({ link: testLink, aiSummaryEnabled: true }).pipe(
      Effect.provide(
        buildTestLayers({
          metadata: mockMetadata,
          content: {
            title: "Example",
            content: "Content...",
            author: null,
            published: null,
            wordCount: 1,
          },
          aiResult: { summary: "A summary", suggestedTags: ["React"] },
        })
      ),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          const suggestions = store.query(
            tables.tagSuggestions.where({ linkId: testLink.id })
          );
          expect(suggestions).toHaveLength(0);
        })
      )
    );
  });

  it.effect("commits linkProcessingFailed when AI service fails", () =>
    processLink({ link: testLink, aiSummaryEnabled: true }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(MetadataFetcher, {
            fetch: () => Effect.succeed(mockMetadata),
          }),
          Layer.succeed(ContentExtractor, {
            extract: () =>
              Effect.succeed({
                title: "Test",
                content: "Content",
                author: null,
                published: null,
                wordCount: 1,
              }),
          }),
          Layer.succeed(AiSummaryGenerator, {
            generate: () =>
              Effect.fail(new AiCallError({ cause: "AI unavailable" })),
          }),
          LinkEventStoreLive(store)
        )
      ),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          const status = store.query(
            tables.linkProcessingStatus.where({ linkId: testLink.id })
          )[0];
          expect(status.status).toBe("failed");
          expect(status.error).toBe("AiCallError");
        })
      )
    )
  );

  it.effect("error escapes when store commit fails in error handler", () => {
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
        queryLinkTagNames: () => Effect.succeed([]),
      })
    );

    return processLink({ link: testLink }).pipe(
      Effect.provide(testLayer),
      silentLogger,
      Effect.exit,
      Effect.tap((exit) =>
        Effect.sync(() => {
          expect(exit._tag).toBe("Failure");
          if (exit._tag === "Failure") {
            expect(String(exit.cause)).toContain("store dead");
          }
        })
      )
    );
  });

  it.effect("skipStartedEvent suppresses linkProcessingStarted", () =>
    processLink({ link: testLink, skipStartedEvent: true }).pipe(
      Effect.provide(buildTestLayers({ metadata: null })),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          // Without a started event, no status row was inserted;
          // linkProcessingCompleted becomes a no-op update.
          const statusRows = store.query(
            tables.linkProcessingStatus.where({ linkId: testLink.id })
          );
          expect(statusRows).toHaveLength(0);
        })
      )
    )
  );

  it.effect("default emits linkProcessingStarted as first event", () =>
    processLink({ link: testLink }).pipe(
      Effect.provide(buildTestLayers({ metadata: null })),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          // End state proves Started was emitted: the linkProcessingStatus
          // row only exists because Started's insert created it. Completed
          // is an UPDATE-only materializer — without a prior Started row
          // this query would return [].
          const statusRows = store.query(
            tables.linkProcessingStatus.where({ linkId: testLink.id })
          );
          expect(statusRows).toHaveLength(1);
          expect(statusRows[0].status).toBe("completed");
          expect(statusRows[0].error).toBeNull();
        })
      )
    )
  );

  it.effect("AiCallError handler records error tag in failed event", () =>
    processLink({ link: testLink, aiSummaryEnabled: true }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(MetadataFetcher, {
            fetch: () => Effect.succeed(mockMetadata),
          }),
          Layer.succeed(ContentExtractor, {
            extract: () => Effect.succeed(null),
          }),
          Layer.succeed(AiSummaryGenerator, {
            generate: () => Effect.fail(new AiCallError({ cause: "timeout" })),
          }),
          LinkEventStoreLive(store)
        )
      ),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          const status = store.query(
            tables.linkProcessingStatus.where({ linkId: testLink.id })
          )[0];
          expect(status.status).toBe("failed");
          expect(status.error).toBe("AiCallError");
        })
      )
    )
  );

  it.effect("defect handler records Defect in failed event", () =>
    processLink({ link: testLink }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(MetadataFetcher, {
            fetch: () => Effect.die("crash"),
          }),
          Layer.succeed(ContentExtractor, {
            extract: () => Effect.succeed(null),
          }),
          Layer.succeed(AiSummaryGenerator, {
            generate: () =>
              Effect.succeed({ summary: null, suggestedTags: [] }),
          }),
          LinkEventStoreLive(store)
        )
      ),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          const status = store.query(
            tables.linkProcessingStatus.where({ linkId: testLink.id })
          )[0];
          expect(status.status).toBe("failed");
          expect(status.error).toBe("Defect");
        })
      )
    )
  );

  it.effect("emits one tagSuggested per AI suggestion", () =>
    processLink({ link: testLink, aiSummaryEnabled: true }).pipe(
      Effect.provide(
        buildTestLayers({
          metadata: mockMetadata,
          content: {
            title: "Example",
            content: "Content...",
            author: null,
            published: null,
            wordCount: 1,
          },
          aiResult: {
            summary: "A summary",
            suggestedTags: ["react", "typescript", "testing"],
          },
        })
      ),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          const suggestions = store.query(
            tables.tagSuggestions.where({ linkId: testLink.id })
          );
          expect(suggestions).toHaveLength(3);
          const names = suggestions.map((s) => s.suggestedName).toSorted();
          expect(names).toEqual(["react", "testing", "typescript"]);
        })
      )
    )
  );
});
