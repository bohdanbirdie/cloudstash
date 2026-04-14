// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { allTags$, tagsForLink$ } from "../../queries/tags";
import { events, tables } from "../../schema";
import { makeTestStore, testId } from "../test-helpers";
import type { TestStore } from "../test-helpers";

describe("tag deletion cascade flow", () => {
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

  const tag = (linkId: string, tagId: string) =>
    store.commit(
      events.linkTagged({
        id: `${linkId}-${tagId}`,
        linkId,
        tagId,
        createdAt: new Date("2026-01-02T10:00:00Z"),
      })
    );

  it("tagDeleted cascades: tag soft-deleted, link_tags rows for that tag removed, other rows preserved", () => {
    const tagA = testId("tag");
    const tagB = testId("tag");
    seedTag(tagA, "A", 0);
    seedTag(tagB, "B", 1);

    const link1 = testId("link");
    const link2 = testId("link");
    const link3 = testId("link");
    seedLink(link1);
    seedLink(link2);
    seedLink(link3);

    // link1 has A + B, link2 has A, link3 has B
    tag(link1, tagA);
    tag(link1, tagB);
    tag(link2, tagA);
    tag(link3, tagB);

    expect(store.query(tables.linkTags)).toHaveLength(4);

    const deletedAt = new Date("2026-01-03T10:00:00Z");
    store.commit(events.tagDeleted({ id: tagA, deletedAt }));

    // tag A soft-deleted, tag B untouched
    const tagARow = store.query(tables.tags.where({ id: tagA }))[0];
    expect(tagARow.deletedAt?.getTime()).toBe(deletedAt.getTime());
    const tagBRow = store.query(tables.tags.where({ id: tagB }))[0];
    expect(tagBRow.deletedAt).toBeNull();

    // link_tags rows with tagId=A are gone
    expect(store.query(tables.linkTags.where({ tagId: tagA }))).toHaveLength(0);

    // link_tags rows with tagId=B remain (on link1 and link3)
    const bRows = store.query(tables.linkTags.where({ tagId: tagB }));
    expect(bRows).toHaveLength(2);
    expect(bRows.map((r) => r.linkId).toSorted()).toEqual(
      [link1, link3].toSorted()
    );

    // allTags$ excludes A (soft-deleted)
    const visibleTags = store.query(allTags$);
    expect(visibleTags.map((t) => t.id)).toEqual([tagB]);

    // tagsForLink$(link1) returns only B
    const link1Tags = store.query(tagsForLink$(link1));
    expect(link1Tags.map((t) => t.id)).toEqual([tagB]);

    // tagsForLink$(link2) returns empty
    expect(store.query(tagsForLink$(link2))).toEqual([]);
  });
});
