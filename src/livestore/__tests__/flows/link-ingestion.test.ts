// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { events, tables } from "../../schema";
import { makeTestStore, testId } from "../test-helpers";
import type { TestStore } from "../test-helpers";

describe("link ingestion flow", () => {
  let store: TestStore;

  beforeEach(async () => {
    store = await makeTestStore();
  });

  afterEach(async () => {
    await store.shutdownPromise?.();
  });

  it("commits the full happy-path event sequence and materializes coherent state", () => {
    const linkId = testId("link");
    const url = "https://example.com/happy-path";
    const domain = "example.com";
    const createdAt = new Date("2026-01-01T10:00:00Z");
    const processingStartedAt = new Date("2026-01-01T10:00:05Z");
    const metadataFetchedAt = new Date("2026-01-01T10:00:06Z");
    const summarizedAt = new Date("2026-01-01T10:00:07Z");
    const suggestionsAt = new Date("2026-01-01T10:00:08Z");
    const completedAt = new Date("2026-01-01T10:00:09Z");

    // 1. linkCreatedV2
    store.commit(
      events.linkCreatedV2({
        id: linkId,
        url,
        domain,
        createdAt,
        source: "manual",
        sourceMeta: null,
      })
    );

    // 2. linkProcessingStarted
    store.commit(
      events.linkProcessingStarted({
        linkId,
        updatedAt: processingStartedAt,
      })
    );

    // 3. linkMetadataFetched
    const snapshotId = testId("snap");
    store.commit(
      events.linkMetadataFetched({
        id: snapshotId,
        linkId,
        title: "Example Happy Path",
        description: "A happy path description",
        image: "https://example.com/og.png",
        favicon: "https://example.com/favicon.ico",
        fetchedAt: metadataFetchedAt,
      })
    );

    // 4. linkSummarized
    const summaryId = testId("sum");
    store.commit(
      events.linkSummarized({
        id: summaryId,
        linkId,
        summary: "An AI summary.",
        model: "test-model",
        summarizedAt,
      })
    );

    // 5. tagSuggested × 3
    const suggestionNames = ["ai", "typescript", "startup"];
    const suggestionIds = suggestionNames.map((name) => {
      const id = testId("sugg");
      store.commit(
        events.tagSuggested({
          id,
          linkId,
          model: "test-model",
          suggestedAt: suggestionsAt,
          suggestedName: name,
          tagId: null,
        })
      );
      return id;
    });

    // 6. linkProcessingCompleted
    store.commit(
      events.linkProcessingCompleted({ linkId, updatedAt: completedAt })
    );

    // Assert links row
    const linkRows = store.query(tables.links.where({ id: linkId }));
    expect(linkRows).toHaveLength(1);
    expect(linkRows[0]).toMatchObject({
      id: linkId,
      url,
      domain,
      status: "unread",
      source: "manual",
      sourceMeta: null,
      deletedAt: null,
      completedAt: null,
    });

    // Assert processing status
    const statusRows = store.query(
      tables.linkProcessingStatus.where({ linkId })
    );
    expect(statusRows).toHaveLength(1);
    expect(statusRows[0].status).toBe("completed");
    expect(statusRows[0].error).toBeNull();

    // Assert snapshot
    const snapshotRows = store.query(tables.linkSnapshots.where({ linkId }));
    expect(snapshotRows).toHaveLength(1);
    expect(snapshotRows[0]).toMatchObject({
      id: snapshotId,
      linkId,
      title: "Example Happy Path",
      description: "A happy path description",
      image: "https://example.com/og.png",
      favicon: "https://example.com/favicon.ico",
    });

    // Assert summary
    const summaryRows = store.query(tables.linkSummaries.where({ linkId }));
    expect(summaryRows).toHaveLength(1);
    expect(summaryRows[0]).toMatchObject({
      id: summaryId,
      linkId,
      summary: "An AI summary.",
      model: "test-model",
    });

    // Assert tag suggestions: N rows, all pending, names match set-equality
    // (guards against duplicate emissions).
    const suggestionRows = store.query(tables.tagSuggestions.where({ linkId }));
    expect(suggestionRows).toHaveLength(suggestionNames.length);
    for (const row of suggestionRows) {
      expect(row.status).toBe("pending");
      expect(suggestionIds).toContain(row.id);
    }
    expect(suggestionRows.map((r) => r.suggestedName).toSorted()).toEqual(
      [...suggestionNames].toSorted()
    );
  });

  it("failure variant: leaves status=failed with error set and no snapshot/summary rows", () => {
    const linkId = testId("link");
    const createdAt = new Date("2026-02-01T10:00:00Z");
    const processingStartedAt = new Date("2026-02-01T10:00:05Z");
    const failedAt = new Date("2026-02-01T10:00:06Z");

    store.commit(
      events.linkCreatedV2({
        id: linkId,
        url: "https://example.com/fail-path",
        domain: "example.com",
        createdAt,
        source: "manual",
        sourceMeta: null,
      })
    );

    store.commit(
      events.linkProcessingStarted({
        linkId,
        updatedAt: processingStartedAt,
      })
    );

    store.commit(
      events.linkProcessingFailed({
        linkId,
        error: "AiCallError",
        updatedAt: failedAt,
      })
    );

    const statusRows = store.query(
      tables.linkProcessingStatus.where({ linkId })
    );
    expect(statusRows).toHaveLength(1);
    expect(statusRows[0].status).toBe("failed");
    expect(statusRows[0].error).toBe("AiCallError");

    // No snapshot/summary/suggestions since those events were not emitted.
    expect(store.query(tables.linkSnapshots.where({ linkId }))).toHaveLength(0);
    expect(store.query(tables.linkSummaries.where({ linkId }))).toHaveLength(0);
    expect(store.query(tables.tagSuggestions.where({ linkId }))).toHaveLength(
      0
    );
  });
});
