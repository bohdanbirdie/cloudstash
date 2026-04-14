// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { tagsForLink$ } from "../../queries/tags";
import { events, tables } from "../../schema";
import { makeTestStore, testId } from "../test-helpers";
import type { TestStore } from "../test-helpers";

/**
 * Simulates the diff flow from src/hooks/use-link-tags.ts#setTagIds:
 * - For each currentId not in newIds, commit linkUntaggedV2.
 * - For each newId not in currentIds, commit linkTagged with id = `${linkId}-${tagId}`.
 */
const setTagIds = (
  store: TestStore,
  linkId: string,
  currentIds: string[],
  nextIds: string[],
  createdAt: Date
) => {
  const current = new Set(currentIds);
  const next = new Set(nextIds);

  for (const id of current) {
    if (!next.has(id)) {
      store.commit(events.linkUntaggedV2({ linkId, tagId: id }));
    }
  }
  for (const id of next) {
    if (!current.has(id)) {
      store.commit(
        events.linkTagged({
          id: `${linkId}-${id}`,
          linkId,
          tagId: id,
          createdAt,
        })
      );
    }
  }
};

describe("tagging diff flow", () => {
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

  const seedTag = (id: string, name: string, sortOrder: number) =>
    store.commit(
      events.tagCreated({
        id,
        name,
        sortOrder,
        createdAt: new Date("2026-01-01T09:00:00Z"),
      })
    );

  it("applies add/remove diffs across two setTagIds calls", () => {
    const linkId = testId("link");
    const tagA = testId("tag");
    const tagB = testId("tag");
    const tagC = testId("tag");
    seedLink(linkId);
    seedTag(tagA, "A", 0);
    seedTag(tagB, "B", 1);
    seedTag(tagC, "C", 2);

    // Call 1: [] -> [A, B]
    setTagIds(
      store,
      linkId,
      [],
      [tagA, tagB],
      new Date("2026-01-02T10:00:00Z")
    );

    let linkTagRows = store.query(tables.linkTags.where({ linkId }));
    expect(linkTagRows).toHaveLength(2);
    expect(linkTagRows.map((r) => r.tagId).toSorted()).toEqual(
      [tagA, tagB].toSorted()
    );

    // Call 2: [A, B] -> [A, C]
    setTagIds(
      store,
      linkId,
      [tagA, tagB],
      [tagA, tagC],
      new Date("2026-01-03T10:00:00Z")
    );

    linkTagRows = store.query(tables.linkTags.where({ linkId }));
    expect(linkTagRows).toHaveLength(2);
    expect(linkTagRows.map((r) => r.tagId).toSorted()).toEqual(
      [tagA, tagC].toSorted()
    );

    // tagsForLink$ reflects via the join with tags
    const tagsViaQuery = store.query(tagsForLink$(linkId));
    expect(tagsViaQuery.map((t) => t.id).toSorted()).toEqual(
      [tagA, tagC].toSorted()
    );
  });

  it("idempotent linkTagged: re-commit with same (linkId, tagId) does not duplicate", () => {
    const linkId = testId("link");
    const tagA = testId("tag");
    seedLink(linkId);
    seedTag(tagA, "A", 0);

    const createdAt = new Date("2026-01-02T10:00:00Z");
    store.commit(
      events.linkTagged({
        id: `${linkId}-${tagA}`,
        linkId,
        tagId: tagA,
        createdAt,
      })
    );
    // Re-commit with a different event id but same (linkId, tagId) — the unique
    // index ensures no duplicate row.
    store.commit(
      events.linkTagged({
        id: testId("lt"),
        linkId,
        tagId: tagA,
        createdAt: new Date("2026-01-03T10:00:00Z"),
      })
    );

    const tagsViaQuery = store.query(tagsForLink$(linkId));
    expect(tagsViaQuery).toHaveLength(1);
    expect(tagsViaQuery[0].id).toBe(tagA);

    const linkTagRows = store.query(
      tables.linkTags.where({ linkId, tagId: tagA })
    );
    expect(linkTagRows).toHaveLength(1);
  });

  it("idempotent linkUntaggedV2: committing twice is safe and leaves state consistent", () => {
    const linkId = testId("link");
    const tagA = testId("tag");
    const tagB = testId("tag");
    seedLink(linkId);
    seedTag(tagA, "A", 0);
    seedTag(tagB, "B", 1);

    const createdAt = new Date("2026-01-02T10:00:00Z");
    store.commit(
      events.linkTagged({
        id: `${linkId}-${tagA}`,
        linkId,
        tagId: tagA,
        createdAt,
      })
    );
    store.commit(
      events.linkTagged({
        id: `${linkId}-${tagB}`,
        linkId,
        tagId: tagB,
        createdAt,
      })
    );

    // Untag A twice — second commit is a no-op delete.
    store.commit(events.linkUntaggedV2({ linkId, tagId: tagA }));
    store.commit(events.linkUntaggedV2({ linkId, tagId: tagA }));

    const tagsViaQuery = store.query(tagsForLink$(linkId));
    expect(tagsViaQuery.map((t) => t.id)).toEqual([tagB]);
  });
});
