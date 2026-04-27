// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  filteredLinks$,
  linksWithAllTags$,
  linksWithTag$,
  untaggedLinks$,
} from "../../queries/filtered-links";
import { events } from "../../schema";
import { makeTestStore, testId } from "../test-helpers";
import type { TestStore } from "../test-helpers";

describe("filtered-links queries", () => {
  let store: TestStore;

  beforeEach(async () => {
    store = await makeTestStore();
  });

  afterEach(async () => {
    await store.shutdownPromise?.();
  });

  const seedLink = (
    overrides: Partial<{
      id: string;
      url: string;
      createdAt: Date;
    }> = {}
  ) => {
    const id = overrides.id ?? testId("link");
    store.commit(
      events.linkCreatedV2({
        id,
        url: overrides.url ?? `https://example.com/${id}`,
        domain: "example.com",
        createdAt: overrides.createdAt ?? new Date("2026-01-01T10:00:00Z"),
        source: "manual",
        sourceMeta: null,
      })
    );
    return id;
  };

  const seedTag = (name: string, sortOrder: number) => {
    const id = testId("tag");
    store.commit(
      events.tagCreated({
        id,
        name,
        sortOrder,
        createdAt: new Date("2026-01-01T10:00:00Z"),
      })
    );
    return id;
  };

  const tagLink = (linkId: string, tagId: string) =>
    store.commit(
      events.linkTagged({
        id: testId("lt"),
        linkId,
        tagId,
        createdAt: new Date("2026-01-02T10:00:00Z"),
      })
    );

  const completeLink = (id: string, completedAt: Date) =>
    store.commit(events.linkCompleted({ id, completedAt }));

  const deleteLink = (id: string, deletedAt: Date) =>
    store.commit(events.linkDeleted({ id, deletedAt }));

  describe("linksWithTag$", () => {
    it("returns only links tagged with the given tag, excluding deleted links", () => {
      const linkA = seedLink({
        url: "https://a.test/1",
        createdAt: new Date("2026-01-01T10:00:00Z"),
      });
      const linkB = seedLink({
        url: "https://a.test/2",
        createdAt: new Date("2026-01-03T10:00:00Z"),
      });
      const linkC = seedLink({
        url: "https://a.test/3",
        createdAt: new Date("2026-01-02T10:00:00Z"),
      });
      const t1 = seedTag("focus", 1);
      const t2 = seedTag("other", 2);
      tagLink(linkA, t1);
      tagLink(linkB, t1);
      tagLink(linkC, t2);

      const rows = store.query(linksWithTag$(t1));
      expect(rows.map((r) => r.id)).toEqual([linkB, linkA]);
    });

    it("excludes soft-deleted links", () => {
      const linkA = seedLink({ url: "https://a.test/1" });
      const linkB = seedLink({ url: "https://a.test/2" });
      const t1 = seedTag("focus", 1);
      tagLink(linkA, t1);
      tagLink(linkB, t1);
      deleteLink(linkB, new Date("2026-01-05T10:00:00Z"));

      const rows = store.query(linksWithTag$(t1));
      expect(rows.map((r) => r.id)).toEqual([linkA]);
    });

    it("returns empty when the tag is soft-deleted", () => {
      const link = seedLink();
      const tag = seedTag("focus", 1);
      tagLink(link, tag);
      store.commit(
        events.tagDeleted({
          id: tag,
          deletedAt: new Date("2026-01-05T10:00:00Z"),
        })
      );

      expect(store.query(linksWithTag$(tag))).toEqual([]);
    });
  });

  describe("untaggedLinks$", () => {
    it("returns only non-deleted links with no non-deleted tags", () => {
      const tagged = seedLink({
        url: "https://a.test/1",
        createdAt: new Date("2026-01-01T10:00:00Z"),
      });
      const untaggedA = seedLink({
        url: "https://a.test/2",
        createdAt: new Date("2026-01-03T10:00:00Z"),
      });
      const untaggedB = seedLink({
        url: "https://a.test/3",
        createdAt: new Date("2026-01-02T10:00:00Z"),
      });
      const deleted = seedLink({
        url: "https://a.test/4",
        createdAt: new Date("2026-01-04T10:00:00Z"),
      });
      const t1 = seedTag("focus", 1);
      tagLink(tagged, t1);
      deleteLink(deleted, new Date("2026-01-05T10:00:00Z"));

      const rows = store.query(untaggedLinks$);
      expect(rows.map((r) => r.id)).toEqual([untaggedA, untaggedB]);
    });

    it("treats links whose only tags are soft-deleted as untagged", () => {
      const link = seedLink();
      const tag = seedTag("focus", 1);
      tagLink(link, tag);
      store.commit(
        events.tagDeleted({
          id: tag,
          deletedAt: new Date("2026-01-05T10:00:00Z"),
        })
      );

      const rows = store.query(untaggedLinks$);
      expect(rows.map((r) => r.id)).toEqual([link]);
    });
  });

  describe("linksWithAllTags$", () => {
    it("returns only links that have every requested tag", () => {
      const linkAB = seedLink({
        url: "https://a.test/1",
        createdAt: new Date("2026-01-02T10:00:00Z"),
      });
      const linkA = seedLink({
        url: "https://a.test/2",
        createdAt: new Date("2026-01-01T10:00:00Z"),
      });
      const linkABC = seedLink({
        url: "https://a.test/3",
        createdAt: new Date("2026-01-03T10:00:00Z"),
      });
      const tA = seedTag("A", 1);
      const tB = seedTag("B", 2);
      const tC = seedTag("C", 3);
      tagLink(linkAB, tA);
      tagLink(linkAB, tB);
      tagLink(linkA, tA);
      tagLink(linkABC, tA);
      tagLink(linkABC, tB);
      tagLink(linkABC, tC);

      const rows = store.query(linksWithAllTags$([tA, tB]));
      expect(rows.map((r) => r.id).toSorted()).toEqual(
        [linkAB, linkABC].toSorted()
      );
    });

    it("with empty tagIds falls back to allLinks$ (all non-deleted)", () => {
      const a = seedLink({
        url: "https://a.test/1",
        createdAt: new Date("2026-01-01T10:00:00Z"),
      });
      const b = seedLink({
        url: "https://a.test/2",
        createdAt: new Date("2026-01-03T10:00:00Z"),
      });
      deleteLink(b, new Date("2026-01-05T10:00:00Z"));

      const rows = store.query(linksWithAllTags$([]));
      expect(rows.map((r) => r.id)).toEqual([a]);
    });

    it("does not count soft-deleted tags toward the match", () => {
      const link = seedLink();
      const tA = seedTag("A", 1);
      const tB = seedTag("B", 2);
      tagLink(link, tA);
      tagLink(link, tB);
      store.commit(
        events.tagDeleted({
          id: tB,
          deletedAt: new Date("2026-01-05T10:00:00Z"),
        })
      );

      const rows = store.query(linksWithAllTags$([tA, tB]));
      expect(rows).toEqual([]);
    });
  });

  describe("filteredLinks$ composite", () => {
    it("status=inbox returns only unread, non-deleted links", () => {
      const unread = seedLink({ url: "https://a.test/1" });
      const done = seedLink({ url: "https://a.test/2" });
      const trashed = seedLink({ url: "https://a.test/3" });
      completeLink(done, new Date("2026-01-02T10:00:00Z"));
      deleteLink(trashed, new Date("2026-01-03T10:00:00Z"));

      const rows = store.query(
        filteredLinks$("inbox", { tagIds: [], untagged: false })
      );
      expect(rows.map((r) => r.id)).toEqual([unread]);
    });

    it("status=completed + tagIds filters by both", () => {
      const linkA = seedLink({ url: "https://a.test/1" });
      const linkB = seedLink({ url: "https://a.test/2" });
      const linkC = seedLink({ url: "https://a.test/3" });
      completeLink(linkA, new Date("2026-01-02T10:00:00Z"));
      completeLink(linkB, new Date("2026-01-03T10:00:00Z"));
      // linkC stays unread
      const focus = seedTag("focus", 1);
      tagLink(linkA, focus);
      tagLink(linkC, focus);

      const rows = store.query(
        filteredLinks$("completed", { tagIds: [focus], untagged: false })
      );
      expect(rows.map((r) => r.id)).toEqual([linkA]);
    });

    it("status=all + untagged=true returns non-deleted links with no non-deleted tag", () => {
      const tagged = seedLink({
        url: "https://a.test/1",
        createdAt: new Date("2026-01-01T10:00:00Z"),
      });
      const untagged = seedLink({
        url: "https://a.test/2",
        createdAt: new Date("2026-01-02T10:00:00Z"),
      });
      const trashed = seedLink({
        url: "https://a.test/3",
        createdAt: new Date("2026-01-03T10:00:00Z"),
      });
      const focus = seedTag("focus", 1);
      tagLink(tagged, focus);
      deleteLink(trashed, new Date("2026-01-05T10:00:00Z"));

      const rows = store.query(
        filteredLinks$("all", { tagIds: [focus], untagged: true })
      );
      // untagged takes precedence over tagIds
      expect(rows.map((r) => r.id)).toEqual([untagged]);
    });

    it("status=archive returns only soft-deleted links, sorted by deletedAt DESC", () => {
      const a = seedLink({ url: "https://a.test/1" });
      const b = seedLink({ url: "https://a.test/2" });
      const c = seedLink({ url: "https://a.test/3" });
      deleteLink(a, new Date("2026-01-03T10:00:00Z"));
      deleteLink(b, new Date("2026-01-05T10:00:00Z"));
      // c is not deleted

      const rows = store.query(
        filteredLinks$("archive", { tagIds: [], untagged: false })
      );
      expect(rows.map((r) => r.id)).toEqual([b, a]);
      expect(rows.map((r) => r.id)).not.toContain(c);
    });

    it("status=inbox + tagIds with multiple tags requires all", () => {
      const linkAB = seedLink({ url: "https://a.test/1" });
      const linkA = seedLink({ url: "https://a.test/2" });
      const tA = seedTag("A", 1);
      const tB = seedTag("B", 2);
      tagLink(linkAB, tA);
      tagLink(linkAB, tB);
      tagLink(linkA, tA);

      const rows = store.query(
        filteredLinks$("inbox", { tagIds: [tA, tB], untagged: false })
      );
      expect(rows.map((r) => r.id)).toEqual([linkAB]);
    });

    it("status=inbox + no filters returns all unread non-deleted", () => {
      const a = seedLink({
        url: "https://a.test/1",
        createdAt: new Date("2026-01-01T10:00:00Z"),
      });
      const b = seedLink({
        url: "https://a.test/2",
        createdAt: new Date("2026-01-02T10:00:00Z"),
      });

      const rows = store.query(
        filteredLinks$("inbox", { tagIds: [], untagged: false })
      );
      expect(rows.map((r) => r.id)).toEqual([b, a]);
    });
  });
});
