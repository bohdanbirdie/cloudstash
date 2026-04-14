// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { events, tables } from "../../schema";
import { makeTestStore, testId } from "../test-helpers";
import type { TestStore } from "../test-helpers";

describe("link-tags materializer", () => {
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

  const seedTag = (id: string, name = "Tag") =>
    store.commit(
      events.tagCreated({
        id,
        name,
        sortOrder: 0,
        createdAt: new Date("2026-01-01T10:00:00Z"),
      })
    );

  describe("v1.LinkTagged", () => {
    it("inserts a link_tags row", () => {
      const linkId = testId("link");
      const tagId = testId("tag");
      seedLink(linkId);
      seedTag(tagId);

      const createdAt = new Date("2026-01-02T10:00:00Z");
      const ltId = testId("lt");
      store.commit(events.linkTagged({ id: ltId, linkId, tagId, createdAt }));

      const rows = store.query(tables.linkTags.where({ linkId, tagId }));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: ltId, linkId, tagId });
      expect(rows[0].createdAt.getTime()).toBe(createdAt.getTime());
    });

    it("dedups via unique (linkId, tagId) index — second insert ignored", () => {
      const linkId = testId("link");
      const tagId = testId("tag");
      seedLink(linkId);
      seedTag(tagId);

      const firstCreatedAt = new Date("2026-01-02T10:00:00Z");
      const firstId = testId("lt");
      store.commit(
        events.linkTagged({
          id: firstId,
          linkId,
          tagId,
          createdAt: firstCreatedAt,
        })
      );
      store.commit(
        events.linkTagged({
          id: testId("lt"),
          linkId,
          tagId,
          createdAt: new Date("2026-01-03T10:00:00Z"),
        })
      );

      const rows = store.query(tables.linkTags.where({ linkId, tagId }));
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(firstId);
      expect(rows[0].createdAt.getTime()).toBe(firstCreatedAt.getTime());
    });
  });

  describe("v1.LinkUntagged (by id)", () => {
    it("deletes the link_tags row matching the given id", () => {
      const linkId = testId("link");
      const tagAId = testId("tag");
      const tagBId = testId("tag");
      seedLink(linkId);
      seedTag(tagAId, "A");
      seedTag(tagBId, "B");

      const ltAId = testId("lt");
      const ltBId = testId("lt");
      const createdAt = new Date("2026-01-02T10:00:00Z");
      store.commit(
        events.linkTagged({ id: ltAId, linkId, tagId: tagAId, createdAt })
      );
      store.commit(
        events.linkTagged({ id: ltBId, linkId, tagId: tagBId, createdAt })
      );

      expect(store.query(tables.linkTags.where({ linkId }))).toHaveLength(2);

      store.commit(events.linkUntagged({ id: ltAId }));

      const remaining = store.query(tables.linkTags.where({ linkId }));
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(ltBId);
      expect(remaining[0].tagId).toBe(tagBId);
    });
  });

  describe("v2.LinkUntagged (by linkId + tagId)", () => {
    it("deletes precisely the row matching linkId and tagId", () => {
      const linkId = testId("link");
      const tagAId = testId("tag");
      const tagBId = testId("tag");
      seedLink(linkId);
      seedTag(tagAId, "A");
      seedTag(tagBId, "B");

      const ltAId = testId("lt");
      const ltBId = testId("lt");
      const createdAt = new Date("2026-01-02T10:00:00Z");
      store.commit(
        events.linkTagged({ id: ltAId, linkId, tagId: tagAId, createdAt })
      );
      store.commit(
        events.linkTagged({ id: ltBId, linkId, tagId: tagBId, createdAt })
      );

      store.commit(events.linkUntaggedV2({ linkId, tagId: tagAId }));

      const remaining = store.query(tables.linkTags.where({ linkId }));
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(ltBId);
      expect(remaining[0].tagId).toBe(tagBId);
    });

    it("does not touch rows with a different linkId", () => {
      const linkIdA = testId("link");
      const linkIdB = testId("link");
      const tagId = testId("tag");
      seedLink(linkIdA);
      seedLink(linkIdB);
      seedTag(tagId);

      const createdAt = new Date("2026-01-02T10:00:00Z");
      store.commit(
        events.linkTagged({
          id: testId("lt"),
          linkId: linkIdA,
          tagId,
          createdAt,
        })
      );
      const keepId = testId("lt");
      store.commit(
        events.linkTagged({
          id: keepId,
          linkId: linkIdB,
          tagId,
          createdAt,
        })
      );

      store.commit(events.linkUntaggedV2({ linkId: linkIdA, tagId }));

      expect(
        store.query(tables.linkTags.where({ linkId: linkIdA }))
      ).toHaveLength(0);
      const bRows = store.query(tables.linkTags.where({ linkId: linkIdB }));
      expect(bRows).toHaveLength(1);
      expect(bRows[0].id).toBe(keepId);
    });
  });
});
