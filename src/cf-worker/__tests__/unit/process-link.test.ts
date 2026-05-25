// @vitest-environment jsdom
import { it, describe, expect, beforeEach, afterEach } from "@effect/vitest";
import { Cause, Effect, Layer } from "effect";

import {
  makeTestStore,
  silentLogger,
  testId,
} from "../../../livestore/__tests__/test-helpers";
import type { TestStore } from "../../../livestore/__tests__/test-helpers";
import { events, tables } from "../../../livestore/schema";
import { LinkId, OrgId, TagId, XTweetId, XUsername } from "../../db/branded";
import { AiCallError } from "../../link-processor/errors";
import { processLink } from "../../link-processor/process-link";
import {
  AiSummaryGenerator,
  ContentExtractor,
  LinkEventStore,
  MetadataFetcher,
} from "../../link-processor/services";
import type { MetadataFetchFailure } from "../../link-processor/services";
import { LinkEventStoreLive } from "../../link-processor/services/link-event-store.live";
import { AI_MODEL } from "../../link-processor/types";
import { MetadataFetchError, MetadataParseError } from "../../metadata/errors";
import { OgMetadata } from "../../metadata/schema";
import {
  EnrichmentGenerateError,
  ThreadProviderEmptyError,
  ThreadProviderHttpError,
} from "../../x-enrichment/errors";
import { EnrichmentGenerator } from "../../x-enrichment/generator";
import type { EnrichmentOutput } from "../../x-enrichment/generator";
import { ThreadProvider } from "../../x-enrichment/services";
import type { ThreadContext } from "../../x-enrichment/services";
import {
  ENRICHMENT_MODEL,
  MONTHLY_ENRICHMENT_CAP,
} from "../../x-enrichment/types";
import { EnrichmentUsage } from "../../x-enrichment/usage";

const enrichmentStubs = Layer.mergeAll(
  Layer.succeed(
    ThreadProvider,
    ThreadProvider.of({
      fetchContext: () =>
        Effect.die(new Error("unexpected ThreadProvider call in test")),
    })
  ),
  Layer.succeed(
    EnrichmentGenerator,
    new EnrichmentGenerator({
      generate: () =>
        Effect.die(new Error("unexpected EnrichmentGenerator call in test")),
    })
  ),
  Layer.succeed(EnrichmentUsage, {
    current: () =>
      Effect.die(new Error("unexpected EnrichmentUsage.current call in test")),
    increment: () =>
      Effect.die(
        new Error("unexpected EnrichmentUsage.increment call in test")
      ),
  })
);

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
    };
    metadataError?: MetadataFetchFailure;
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
      fetch: () =>
        options.metadataError
          ? Effect.fail(options.metadataError)
          : Effect.succeed(OgMetadata.make(options.metadata ?? {})),
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
    LinkEventStoreLive(store),
    enrichmentStubs
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

  it.effect(
    "completes without writing a snapshot when fetch yields empty metadata",
    () =>
      processLink({ link: testLink }).pipe(
        Effect.provide(buildTestLayers({})),
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
          LinkEventStoreLive(store),
          enrichmentStubs
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

  it.effect(
    "records fetch:<code> when metadata fetch fails with HTTP status",
    () =>
      processLink({ link: testLink }).pipe(
        Effect.provide(
          buildTestLayers({
            metadataError: new MetadataFetchError({
              statusCode: 404,
              url: testLink.url,
            }),
          })
        ),
        silentLogger,
        Effect.tap(() =>
          Effect.sync(() => {
            const status = store.query(
              tables.linkProcessingStatus.where({ linkId: testLink.id })
            )[0];
            expect(status.status).toBe("failed");
            expect(status.error).toBe("fetch:404");
            // Snapshot is not written when fetch fails.
            expect(
              store.query(tables.linkSnapshots.where({ linkId: testLink.id }))
            ).toHaveLength(0);
          })
        )
      )
  );

  it.effect("records fetch:unreadable when metadata parsing fails", () =>
    processLink({ link: testLink }).pipe(
      Effect.provide(
        buildTestLayers({
          metadataError: new MetadataParseError({
            cause: new Error("malformed html"),
            url: testLink.url,
          }),
        })
      ),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          const status = store.query(
            tables.linkProcessingStatus.where({ linkId: testLink.id })
          )[0];
          expect(status.status).toBe("failed");
          expect(status.error).toBe("fetch:unreadable");
          expect(
            store.query(tables.linkSnapshots.where({ linkId: testLink.id }))
          ).toHaveLength(0);
        })
      )
    )
  );

  it.effect("records fetch:timeout when metadata fetch times out", () =>
    processLink({ link: testLink }).pipe(
      Effect.provide(
        buildTestLayers({ metadataError: new Cause.TimeoutException() })
      ),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          const status = store.query(
            tables.linkProcessingStatus.where({ linkId: testLink.id })
          )[0];
          expect(status.status).toBe("failed");
          expect(status.error).toBe("fetch:timeout");
          expect(
            store.query(tables.linkSnapshots.where({ linkId: testLink.id }))
          ).toHaveLength(0);
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
          LinkEventStoreLive(store),
          enrichmentStubs
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
      }),
      enrichmentStubs
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
      Effect.provide(buildTestLayers({})),
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
      Effect.provide(buildTestLayers({})),
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
          LinkEventStoreLive(store),
          enrichmentStubs
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
          LinkEventStoreLive(store),
          enrichmentStubs
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

const STORE_ID = OrgId.make("org-router-test");
const X_TWEET_URL = "https://x.com/alice/status/1810000000000000001";
const X_TWEET_ID = "1810000000000000001";
const xLink = { id: LinkId.make("link-x-1"), url: X_TWEET_URL };

const seedXLink = () =>
  store.commit(
    events.linkCreatedV2({
      id: xLink.id,
      url: xLink.url,
      domain: "x.com",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      source: "test",
      sourceMeta: null,
    })
  );

const xContext: ThreadContext = {
  root: {
    id: XTweetId.make(X_TWEET_ID),
    text: "main body",
    authorScreenName: XUsername.make("alice"),
    authorName: "Alice",
    createdAt: null,
    quotedText: null,
    quotedAuthorScreenName: null,
    inReplyToId: null,
    conversationId: XTweetId.make(X_TWEET_ID),
    externalUrls: [],
  },
  authorContinuations: [],
  isReply: false,
};

interface EnrichmentLayerOpts {
  budgetUsed?: number;
  providerResult?:
    | ThreadContext
    | Effect.Effect<never, ThreadProviderHttpError | ThreadProviderEmptyError>;
  generatorResult?:
    | EnrichmentOutput
    | Effect.Effect<never, EnrichmentGenerateError>;
}

const enrichmentLayer = (opts: EnrichmentLayerOpts = {}) => {
  const usedRef = { value: opts.budgetUsed ?? 0 };
  return Layer.mergeAll(
    Layer.succeed(
      ThreadProvider,
      ThreadProvider.of({
        fetchContext: () =>
          opts.providerResult === undefined
            ? Effect.succeed(xContext)
            : Effect.isEffect(opts.providerResult)
              ? opts.providerResult
              : Effect.succeed(opts.providerResult),
      })
    ),
    Layer.succeed(
      EnrichmentGenerator,
      new EnrichmentGenerator({
        generate: () =>
          opts.generatorResult === undefined
            ? Effect.succeed({
                summary: "enriched summary text",
                suggestedTags: ["pro-tag"],
              })
            : Effect.isEffect(opts.generatorResult)
              ? opts.generatorResult
              : Effect.succeed(opts.generatorResult),
      })
    ),
    Layer.succeed(EnrichmentUsage, {
      current: () => Effect.succeed({ used: usedRef.value, period: "2026-05" }),
      increment: () => {
        usedRef.value += 1;
        return Effect.succeed({ used: usedRef.value, period: "2026-05" });
      },
    })
  );
};

describe("processLink enrichment router", () => {
  it.effect(
    "happy path: commits with ENRICHMENT_MODEL and enriched tags",
    () => {
      seedXLink();
      return processLink({
        link: xLink,
        aiSummaryEnabled: true,
        xContentEnrichmentEnabled: true,
        storeId: STORE_ID,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(MetadataFetcher, {
              fetch: () => Effect.succeed(OgMetadata.make({ title: "T" })),
            }),
            Layer.succeed(ContentExtractor, {
              extract: () =>
                Effect.die(new Error("basic extract should not run")),
            }),
            Layer.succeed(AiSummaryGenerator, {
              generate: () =>
                Effect.die(new Error("basic AI generate should not run")),
            }),
            LinkEventStoreLive(store),
            enrichmentLayer()
          )
        ),
        silentLogger,
        Effect.tap(() =>
          Effect.sync(() => {
            const summaries = store.query(
              tables.linkSummaries.where({ linkId: xLink.id })
            );
            expect(summaries).toHaveLength(1);
            expect(summaries[0].model).toBe(ENRICHMENT_MODEL);
            expect(summaries[0].summary).toBe("enriched summary text");

            const suggestions = store.query(
              tables.tagSuggestions.where({ linkId: xLink.id })
            );
            expect(suggestions).toHaveLength(1);
            expect(suggestions[0].suggestedName).toBe("pro-tag");
          })
        )
      );
    }
  );

  it.effect(
    "budget exhausted: falls back to basic, commits with AI_MODEL",
    () => {
      seedXLink();
      return processLink({
        link: xLink,
        aiSummaryEnabled: true,
        xContentEnrichmentEnabled: true,
        storeId: STORE_ID,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(MetadataFetcher, {
              fetch: () => Effect.succeed(OgMetadata.make({ title: "T" })),
            }),
            Layer.succeed(ContentExtractor, {
              extract: () =>
                Effect.succeed({
                  title: "T",
                  content: "C",
                  author: null,
                  published: null,
                  wordCount: 1,
                }),
            }),
            Layer.succeed(AiSummaryGenerator, {
              generate: () =>
                Effect.succeed({
                  summary: "basic summary",
                  suggestedTags: ["basic-tag"],
                }),
            }),
            LinkEventStoreLive(store),
            Layer.succeed(
              ThreadProvider,
              ThreadProvider.of({
                fetchContext: () =>
                  Effect.die(new Error("provider should not be called")),
              })
            ),
            Layer.succeed(
              EnrichmentGenerator,
              new EnrichmentGenerator({
                generate: () =>
                  Effect.die(new Error("generator should not be called")),
              })
            ),
            Layer.succeed(EnrichmentUsage, {
              current: () =>
                Effect.succeed({
                  used: MONTHLY_ENRICHMENT_CAP,
                  period: "2026-05",
                }),
              increment: () =>
                Effect.die(new Error("increment should not be called")),
            })
          )
        ),
        silentLogger,
        Effect.tap(() =>
          Effect.sync(() => {
            const summaries = store.query(
              tables.linkSummaries.where({ linkId: xLink.id })
            );
            expect(summaries).toHaveLength(1);
            expect(summaries[0].model).toBe(AI_MODEL);
            expect(summaries[0].summary).toBe("basic summary");
          })
        )
      );
    }
  );

  it.effect(
    "provider failure (http): falls back to basic, commits with AI_MODEL",
    () => {
      seedXLink();
      return processLink({
        link: xLink,
        aiSummaryEnabled: true,
        xContentEnrichmentEnabled: true,
        storeId: STORE_ID,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(MetadataFetcher, {
              fetch: () => Effect.succeed(OgMetadata.make({ title: "T" })),
            }),
            Layer.succeed(ContentExtractor, {
              extract: () =>
                Effect.succeed({
                  title: "T",
                  content: "C",
                  author: null,
                  published: null,
                  wordCount: 1,
                }),
            }),
            Layer.succeed(AiSummaryGenerator, {
              generate: () =>
                Effect.succeed({
                  summary: "basic summary",
                  suggestedTags: [],
                }),
            }),
            LinkEventStoreLive(store),
            enrichmentLayer({
              providerResult: Effect.fail(
                new ThreadProviderHttpError({
                  url: X_TWEET_URL,
                  status: 503,
                  tweetId: XTweetId.make(X_TWEET_ID),
                })
              ),
            })
          )
        ),
        silentLogger,
        Effect.tap(() =>
          Effect.sync(() => {
            const summaries = store.query(
              tables.linkSummaries.where({ linkId: xLink.id })
            );
            expect(summaries).toHaveLength(1);
            expect(summaries[0].model).toBe(AI_MODEL);
            expect(summaries[0].summary).toBe("basic summary");
          })
        )
      );
    }
  );

  it.effect(
    "provider failure (empty): falls back to basic, commits with AI_MODEL",
    () => {
      seedXLink();
      return processLink({
        link: xLink,
        aiSummaryEnabled: true,
        xContentEnrichmentEnabled: true,
        storeId: STORE_ID,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(MetadataFetcher, {
              fetch: () => Effect.succeed(OgMetadata.make({ title: "T" })),
            }),
            Layer.succeed(ContentExtractor, {
              extract: () =>
                Effect.succeed({
                  title: "T",
                  content: "C",
                  author: null,
                  published: null,
                  wordCount: 1,
                }),
            }),
            Layer.succeed(AiSummaryGenerator, {
              generate: () =>
                Effect.succeed({
                  summary: "basic summary",
                  suggestedTags: [],
                }),
            }),
            LinkEventStoreLive(store),
            enrichmentLayer({
              providerResult: Effect.fail(
                new ThreadProviderEmptyError({
                  url: X_TWEET_URL,
                  tweetId: XTweetId.make(X_TWEET_ID),
                })
              ),
            })
          )
        ),
        silentLogger,
        Effect.tap(() =>
          Effect.sync(() => {
            const summaries = store.query(
              tables.linkSummaries.where({ linkId: xLink.id })
            );
            expect(summaries).toHaveLength(1);
            expect(summaries[0].model).toBe(AI_MODEL);
          })
        )
      );
    }
  );

  it.effect(
    "generator failure: falls back to basic, commits with AI_MODEL",
    () => {
      seedXLink();
      return processLink({
        link: xLink,
        aiSummaryEnabled: true,
        xContentEnrichmentEnabled: true,
        storeId: STORE_ID,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(MetadataFetcher, {
              fetch: () => Effect.succeed(OgMetadata.make({ title: "T" })),
            }),
            Layer.succeed(ContentExtractor, {
              extract: () =>
                Effect.succeed({
                  title: "T",
                  content: "C",
                  author: null,
                  published: null,
                  wordCount: 1,
                }),
            }),
            Layer.succeed(AiSummaryGenerator, {
              generate: () =>
                Effect.succeed({
                  summary: "basic summary",
                  suggestedTags: [],
                }),
            }),
            LinkEventStoreLive(store),
            enrichmentLayer({
              generatorResult: Effect.fail(
                new EnrichmentGenerateError({
                  model: ENRICHMENT_MODEL,
                  cause: new Error("openrouter 500"),
                })
              ),
            })
          )
        ),
        silentLogger,
        Effect.tap(() =>
          Effect.sync(() => {
            const summaries = store.query(
              tables.linkSummaries.where({ linkId: xLink.id })
            );
            expect(summaries).toHaveLength(1);
            expect(summaries[0].model).toBe(AI_MODEL);
          })
        )
      );
    }
  );

  it.effect("gating: non-X URL with enrichment enabled uses basic path", () =>
    processLink({
      link: testLink,
      aiSummaryEnabled: true,
      xContentEnrichmentEnabled: true,
      storeId: STORE_ID,
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          buildTestLayers({
            metadata: mockMetadata,
            content: {
              title: "T",
              content: "C",
              author: null,
              published: null,
              wordCount: 1,
            },
            aiResult: {
              summary: "basic summary",
              suggestedTags: [],
            },
          })
        )
      ),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          const summaries = store.query(
            tables.linkSummaries.where({ linkId: testLink.id })
          );
          expect(summaries).toHaveLength(1);
          expect(summaries[0].model).toBe(AI_MODEL);
        })
      )
    )
  );

  it.effect("gating: X URL but storeId undefined uses basic path", () => {
    seedXLink();
    return processLink({
      link: xLink,
      aiSummaryEnabled: true,
      xContentEnrichmentEnabled: true,
      // storeId omitted
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(MetadataFetcher, {
            fetch: () => Effect.succeed(OgMetadata.make({ title: "T" })),
          }),
          Layer.succeed(ContentExtractor, {
            extract: () =>
              Effect.succeed({
                title: "T",
                content: "C",
                author: null,
                published: null,
                wordCount: 1,
              }),
          }),
          Layer.succeed(AiSummaryGenerator, {
            generate: () =>
              Effect.succeed({
                summary: "basic summary",
                suggestedTags: [],
              }),
          }),
          LinkEventStoreLive(store),
          enrichmentStubs
        )
      ),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          const summaries = store.query(
            tables.linkSummaries.where({ linkId: xLink.id })
          );
          expect(summaries).toHaveLength(1);
          expect(summaries[0].model).toBe(AI_MODEL);
        })
      )
    );
  });

  it.effect(
    "gating: X URL but xContentEnrichmentEnabled=false uses basic path",
    () => {
      seedXLink();
      return processLink({
        link: xLink,
        aiSummaryEnabled: true,
        xContentEnrichmentEnabled: false,
        storeId: STORE_ID,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(MetadataFetcher, {
              fetch: () => Effect.succeed(OgMetadata.make({ title: "T" })),
            }),
            Layer.succeed(ContentExtractor, {
              extract: () =>
                Effect.succeed({
                  title: "T",
                  content: "C",
                  author: null,
                  published: null,
                  wordCount: 1,
                }),
            }),
            Layer.succeed(AiSummaryGenerator, {
              generate: () =>
                Effect.succeed({
                  summary: "basic summary",
                  suggestedTags: [],
                }),
            }),
            LinkEventStoreLive(store),
            enrichmentStubs
          )
        ),
        silentLogger,
        Effect.tap(() =>
          Effect.sync(() => {
            const summaries = store.query(
              tables.linkSummaries.where({ linkId: xLink.id })
            );
            expect(summaries).toHaveLength(1);
            expect(summaries[0].model).toBe(AI_MODEL);
          })
        )
      );
    }
  );
});
