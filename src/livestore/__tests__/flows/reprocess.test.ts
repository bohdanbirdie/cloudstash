// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { events, tables } from "../../schema";
import { makeTestStore, testId } from "../test-helpers";
import type { TestStore } from "../test-helpers";

// Tests the MATERIALIZER CONTRACT for reprocess scenarios — that the eventlog
// accepts and materializes a reprocess sequence correctly.
//
// The duplicate-suggestion regression from commit d7ed697 is enforced by
// app-level dedup in src/cf-worker/link-processor/process-link.ts and covered
// in src/cf-worker/__tests__/unit/process-link.test.ts (case-insensitive
// dedup cases). The flow tests below document that contract (the store trusts
// the app) and verify the materializer's reset semantics on ProcessingStarted
// after a failure.
describe("reprocess flow (materializer contract)", () => {
  let store: TestStore;

  beforeEach(async () => {
    store = await makeTestStore();
  });

  afterEach(async () => {
    await store.shutdownPromise?.();
  });

  const seedLink = (id: string) =>
    store.commit(
      events.linkCreatedV2({
        id,
        url: `https://example.com/${id}`,
        domain: "example.com",
        createdAt: new Date("2026-01-01T10:00:00Z"),
        source: "manual",
        sourceMeta: null,
      })
    );

  const suggest = (linkId: string, name: string, suggestedAt: Date) =>
    store.commit(
      events.tagSuggested({
        id: testId("sugg"),
        linkId,
        model: "test-model",
        suggestedAt,
        suggestedName: name,
        tagId: null,
      })
    );

  it("records whatever suggestions the app emits on reprocess (no store-level name dedup)", () => {
    // The v1.TagSuggested materializer is a plain insert (no dedup on name).
    // The app-level code in process-link.ts filters suggestions whose names
    // already exist in tag_suggestions + tags before emitting. This test
    // documents that contract: the store trusts the app and records whatever
    // is emitted, so the app must dedup.
    const linkId = testId("link");
    seedLink(linkId);

    // Initial processing run: Started -> MetadataFetched -> TagSuggested × 3 -> Completed
    store.commit(
      events.linkProcessingStarted({
        linkId,
        updatedAt: new Date("2026-01-01T10:00:05Z"),
      })
    );
    store.commit(
      events.linkMetadataFetched({
        id: testId("snap"),
        linkId,
        title: "Initial",
        description: null,
        image: null,
        favicon: null,
        fetchedAt: new Date("2026-01-01T10:00:06Z"),
      })
    );
    suggest(linkId, "ai", new Date("2026-01-01T10:00:07Z"));
    suggest(linkId, "typescript", new Date("2026-01-01T10:00:07Z"));
    suggest(linkId, "startup", new Date("2026-01-01T10:00:07Z"));
    store.commit(
      events.linkProcessingCompleted({
        linkId,
        updatedAt: new Date("2026-01-01T10:00:08Z"),
      })
    );

    expect(store.query(tables.tagSuggestions.where({ linkId }))).toHaveLength(
      3
    );
    expect(
      store.query(tables.linkProcessingStatus.where({ linkId }))[0].status
    ).toBe("completed");

    // Reprocess requested.
    store.commit(
      events.linkReprocessRequested({
        linkId,
        requestedAt: new Date("2026-01-02T10:00:00Z"),
      })
    );
    expect(
      store.query(tables.linkProcessingStatus.where({ linkId }))[0].status
    ).toBe("reprocess-requested");

    // Second processing run: Started should reset state, then app code emits only
    // suggestions for names NOT already in tag_suggestions ("ai" and "typescript"
    // already exist → skip; "web" is new → emit).
    store.commit(
      events.linkProcessingStarted({
        linkId,
        updatedAt: new Date("2026-01-02T10:00:05Z"),
      })
    );
    const statusAfterRestart = store.query(
      tables.linkProcessingStatus.where({ linkId })
    )[0];
    expect(statusAfterRestart.status).toBe("pending");
    expect(statusAfterRestart.error).toBeNull();

    // Only the new name is emitted (this is what the fixed app does — the
    // materializer itself does not dedup by name).
    suggest(linkId, "web", new Date("2026-01-02T10:00:07Z"));

    const finalSuggestions = store.query(
      tables.tagSuggestions.where({ linkId })
    );
    expect(finalSuggestions).toHaveLength(4);
    const names = finalSuggestions.map((s) => s.suggestedName).toSorted();
    expect(names).toEqual(["ai", "startup", "typescript", "web"]);
  });

  it("ProcessingStarted materializer resets the error field after a prior failure", () => {
    const linkId = testId("link");
    seedLink(linkId);

    store.commit(
      events.linkProcessingStarted({
        linkId,
        updatedAt: new Date("2026-01-01T10:00:00Z"),
      })
    );
    store.commit(
      events.linkProcessingFailed({
        linkId,
        error: "AiCallError",
        updatedAt: new Date("2026-01-01T10:00:01Z"),
      })
    );

    let status = store.query(tables.linkProcessingStatus.where({ linkId }))[0];
    expect(status.status).toBe("failed");
    expect(status.error).toBe("AiCallError");

    // Reprocess
    store.commit(
      events.linkReprocessRequested({
        linkId,
        requestedAt: new Date("2026-01-02T10:00:00Z"),
      })
    );
    // Second Started clears the error via onConflict update.
    store.commit(
      events.linkProcessingStarted({
        linkId,
        updatedAt: new Date("2026-01-02T10:00:05Z"),
      })
    );

    status = store.query(tables.linkProcessingStatus.where({ linkId }))[0]!;
    expect(status.status).toBe("pending");
    expect(status.error).toBeNull();
  });
});
