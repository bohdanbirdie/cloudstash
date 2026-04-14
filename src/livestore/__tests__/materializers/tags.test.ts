// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { events, tables } from "../../schema";
import { makeTestStore, testId } from "../test-helpers";
import type { TestStore } from "../test-helpers";

describe("tags materializer", () => {
  let store: TestStore;

  beforeEach(async () => {
    store = await makeTestStore();
  });

  afterEach(async () => {
    await store.shutdownPromise?.();
  });

  describe("v1.TagCreated", () => {
    it("inserts a tag with provided fields and null deletedAt", () => {
      const id = testId("tag");
      const createdAt = new Date("2026-01-01T10:00:00Z");

      store.commit(
        events.tagCreated({ id, name: "Reading", sortOrder: 1, createdAt })
      );

      const rows = store.query(tables.tags.where({ id }));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id,
        name: "Reading",
        sortOrder: 1,
        deletedAt: null,
      });
      expect(rows[0].createdAt.getTime()).toBe(createdAt.getTime());
    });

    it("ignores duplicate id via onConflict ignore", () => {
      const id = testId("tag");
      const createdAt = new Date("2026-01-01T10:00:00Z");
      store.commit(
        events.tagCreated({ id, name: "Reading", sortOrder: 1, createdAt })
      );
      store.commit(
        events.tagCreated({
          id,
          name: "Different",
          sortOrder: 99,
          createdAt: new Date("2026-02-01T10:00:00Z"),
        })
      );

      const rows = store.query(tables.tags.where({ id }));
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Reading");
      expect(rows[0].sortOrder).toBe(1);
    });
  });

  describe("v1.TagRenamed", () => {
    it("updates the tag name", () => {
      const id = testId("tag");
      store.commit(
        events.tagCreated({
          id,
          name: "Old",
          sortOrder: 0,
          createdAt: new Date("2026-01-01T10:00:00Z"),
        })
      );

      store.commit(events.tagRenamed({ id, name: "New" }));

      const row = store.query(tables.tags.where({ id }))[0];
      expect(row.name).toBe("New");
    });
  });

  describe("v1.TagReordered", () => {
    it("updates the tag sortOrder", () => {
      const id = testId("tag");
      store.commit(
        events.tagCreated({
          id,
          name: "T",
          sortOrder: 0,
          createdAt: new Date("2026-01-01T10:00:00Z"),
        })
      );

      store.commit(events.tagReordered({ id, sortOrder: 42 }));

      const row = store.query(tables.tags.where({ id }))[0];
      expect(row.sortOrder).toBe(42);
    });
  });

  describe("v1.TagDeleted (cascade)", () => {
    it("sets deletedAt on the tag and removes all link_tags rows for that tag", () => {
      const tagId = testId("tag");
      const otherTagId = testId("tag");
      const linkIdA = testId("link");
      const linkIdB = testId("link");
      const createdAt = new Date("2026-01-01T10:00:00Z");

      // Seed tags
      store.commit(
        events.tagCreated({
          id: tagId,
          name: "Target",
          sortOrder: 0,
          createdAt,
        })
      );
      store.commit(
        events.tagCreated({
          id: otherTagId,
          name: "Keep",
          sortOrder: 1,
          createdAt,
        })
      );

      // Seed links
      store.commit(
        events.linkCreatedV2({
          id: linkIdA,
          url: "https://example.com/a",
          domain: "example.com",
          createdAt,
          source: "manual",
          sourceMeta: null,
        })
      );
      store.commit(
        events.linkCreatedV2({
          id: linkIdB,
          url: "https://example.com/b",
          domain: "example.com",
          createdAt,
          source: "manual",
          sourceMeta: null,
        })
      );

      // Tag both links with the target tag, and linkA with otherTag too
      store.commit(
        events.linkTagged({
          id: testId("lt"),
          linkId: linkIdA,
          tagId,
          createdAt,
        })
      );
      store.commit(
        events.linkTagged({
          id: testId("lt"),
          linkId: linkIdB,
          tagId,
          createdAt,
        })
      );
      store.commit(
        events.linkTagged({
          id: testId("lt"),
          linkId: linkIdA,
          tagId: otherTagId,
          createdAt,
        })
      );

      expect(store.query(tables.linkTags.where({ tagId }))).toHaveLength(2);

      const deletedAt = new Date("2026-01-05T10:00:00Z");
      store.commit(events.tagDeleted({ id: tagId, deletedAt }));

      // Tag row has deletedAt set (soft delete)
      const tagRow = store.query(tables.tags.where({ id: tagId }))[0];
      expect(tagRow.deletedAt?.getTime()).toBe(deletedAt.getTime());

      // link_tags rows for the deleted tag are gone
      expect(store.query(tables.linkTags.where({ tagId }))).toHaveLength(0);

      // link_tags rows for the other tag remain
      const otherRows = store.query(
        tables.linkTags.where({ tagId: otherTagId })
      );
      expect(otherRows).toHaveLength(1);
      expect(otherRows[0].linkId).toBe(linkIdA);
    });
  });
});
