// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { tagsForLink$ } from "../../queries/tags";
import { events, tables } from "../../schema";
import { makeTestStore, testId } from "../test-helpers";
import type { TestStore } from "../test-helpers";

/**
 * Mixed v1/v2 events in a single eventlog materialize coherently:
 * - v1.LinkCreated vs v2.LinkCreated (source/sourceMeta)
 * - v1.LinkUntagged (by link_tags row id) vs v2.LinkUntagged (precise by linkId+tagId)
 */
describe("event migration flow (v1 + v2 coexistence)", () => {
  let store: TestStore;

  beforeEach(async () => {
    store = await makeTestStore();
  });

  afterEach(async () => {
    await store.shutdownPromise?.();
  });

  it("v1 linkCreated and v2 linkCreatedV2 both materialize into links; source/sourceMeta differ", () => {
    const v1LinkId = testId("link");
    store.commit(
      events.linkCreated({
        id: v1LinkId,
        url: "https://example.com/v1",
        domain: "example.com",
        createdAt: new Date("2026-01-01T10:00:00Z"),
      })
    );

    const v2LinkId = testId("link");
    store.commit(
      events.linkCreatedV2({
        id: v2LinkId,
        url: "https://example.com/v2",
        domain: "example.com",
        createdAt: new Date("2026-01-01T10:00:00Z"),
        source: "telegram",
        sourceMeta: JSON.stringify({ chatId: 42 }),
      })
    );

    const v1Row = store.query(tables.links.where({ id: v1LinkId }))[0];
    expect(v1Row.source).toBeNull();
    expect(v1Row.sourceMeta).toBeNull();

    const v2Row = store.query(tables.links.where({ id: v2LinkId }))[0];
    expect(v2Row.source).toBe("telegram");
    expect(v2Row.sourceMeta).toBe(JSON.stringify({ chatId: 42 }));
  });

  it("both v1 and v2 untagging paths coexist and remove the link_tags row", () => {
    const link1 = testId("link");
    const tagA = testId("tag");

    store.commit(
      events.linkCreated({
        id: link1,
        url: `https://example.com/${link1}`,
        domain: "example.com",
        createdAt: new Date("2026-01-01T10:00:00Z"),
      })
    );
    store.commit(
      events.tagCreated({
        id: tagA,
        name: "A",
        sortOrder: 0,
        createdAt: new Date("2026-01-01T09:00:00Z"),
      })
    );

    // v1 path: the linkTagged event's id IS the link_tags row id, and v1
    // linkUntagged deletes by that id.
    const firstTaggedEventId = testId("lt");
    store.commit(
      events.linkTagged({
        id: firstTaggedEventId,
        linkId: link1,
        tagId: tagA,
        createdAt: new Date("2026-01-02T10:00:00Z"),
      })
    );
    expect(store.query(tables.linkTags.where({ linkId: link1 }))).toHaveLength(
      1
    );

    store.commit(events.linkUntagged({ id: firstTaggedEventId }));
    expect(store.query(tables.linkTags.where({ linkId: link1 }))).toHaveLength(
      0
    );

    // Re-tag, then use v2 precise path to untag.
    const secondTaggedEventId = testId("lt");
    store.commit(
      events.linkTagged({
        id: secondTaggedEventId,
        linkId: link1,
        tagId: tagA,
        createdAt: new Date("2026-01-03T10:00:00Z"),
      })
    );
    expect(store.query(tables.linkTags.where({ linkId: link1 }))).toHaveLength(
      1
    );

    store.commit(events.linkUntaggedV2({ linkId: link1, tagId: tagA }));

    expect(store.query(tables.linkTags.where({ linkId: link1 }))).toHaveLength(
      0
    );
    expect(store.query(tagsForLink$(link1))).toEqual([]);
  });
});
