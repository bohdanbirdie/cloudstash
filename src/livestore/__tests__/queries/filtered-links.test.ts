// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  filteredLinks$,
  linksWithAllTags$,
  linksWithTag$,
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

  const suggest = (
    linkId: string,
    opts: { tagId?: string | null; suggestedName: string }
  ) => {
    const id = testId("sug");
    store.commit(
      events.tagSuggested({
        id,
        linkId,
        tagId: opts.tagId ?? null,
        suggestedName: opts.suggestedName,
        model: "test-model",
        suggestedAt: new Date("2026-01-02T10:00:00Z"),
      })
    );
    return id;
  };

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

  describe("linksWithTag$ with suggestions", () => {
    it("matches links that have the existing tag as a pending suggestion", () => {
      const applied = seedLink({ url: "https://a.test/1" });
      const suggested = seedLink({ url: "https://a.test/2" });
      const untouched = seedLink({ url: "https://a.test/3" });
      const tag = seedTag("focus", 1);
      tagLink(applied, tag);
      suggest(suggested, { tagId: tag, suggestedName: "focus" });

      const rows = store.query(linksWithTag$(tag));
      expect(rows.map((r) => r.id).toSorted()).toEqual(
        [applied, suggested].toSorted()
      );
      expect(rows.map((r) => r.id)).not.toContain(untouched);
    });

    it("matches a new-tag suggestion by its suggestedName slug", () => {
      const link = seedLink();
      suggest(link, { suggestedName: "bullmq" });

      const rows = store.query(linksWithTag$("bullmq"));
      expect(rows.map((r) => r.id)).toEqual([link]);
    });

    it("ignores dismissed and accepted suggestions", () => {
      const dismissedLink = seedLink({ url: "https://a.test/1" });
      const acceptedLink = seedLink({ url: "https://a.test/2" });
      const s1 = suggest(dismissedLink, { suggestedName: "bullmq" });
      const s2 = suggest(acceptedLink, { suggestedName: "bullmq" });
      store.commit(events.tagSuggestionDismissed({ id: s1 }));
      store.commit(events.tagSuggestionAccepted({ id: s2 }));

      expect(store.query(linksWithTag$("bullmq"))).toEqual([]);
    });
  });

  describe("linksWithAllTags$ with suggestions", () => {
    it("counts applied and suggested matches together toward 'all tags' requirement", () => {
      const link = seedLink();
      const tA = seedTag("A", 1);
      tagLink(link, tA);
      // Second tag is only a new-tag suggestion
      suggest(link, { suggestedName: "bullmq" });

      const rows = store.query(linksWithAllTags$([tA, "bullmq"]));
      expect(rows.map((r) => r.id)).toEqual([link]);
    });

    it("returns nothing when one of the required tags is neither applied nor suggested", () => {
      const link = seedLink();
      const tA = seedTag("A", 1);
      tagLink(link, tA);

      const rows = store.query(linksWithAllTags$([tA, "missing"]));
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

      const rows = store.query(filteredLinks$("inbox", { tagIds: [] }));
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
        filteredLinks$("completed", { tagIds: [focus] })
      );
      expect(rows.map((r) => r.id)).toEqual([linkA]);
    });

    it("status=archive returns only soft-deleted links, sorted by deletedAt DESC", () => {
      const a = seedLink({ url: "https://a.test/1" });
      const b = seedLink({ url: "https://a.test/2" });
      const c = seedLink({ url: "https://a.test/3" });
      deleteLink(a, new Date("2026-01-03T10:00:00Z"));
      deleteLink(b, new Date("2026-01-05T10:00:00Z"));
      // c is not deleted

      const rows = store.query(filteredLinks$("archive", { tagIds: [] }));
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

      const rows = store.query(filteredLinks$("inbox", { tagIds: [tA, tB] }));
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

      const rows = store.query(filteredLinks$("inbox", { tagIds: [] }));
      expect(rows.map((r) => r.id)).toEqual([b, a]);
    });

    it("status=inbox + new-tag-suggestion slug returns links with that pending suggestion", () => {
      const link = seedLink();
      suggest(link, { suggestedName: "bullmq" });

      const rows = store.query(filteredLinks$("inbox", { tagIds: ["bullmq"] }));
      expect(rows.map((r) => r.id)).toEqual([link]);
    });

    it("status=inbox + tagIds matches mixed applied + suggested across links", () => {
      const applied = seedLink({ url: "https://a.test/1" });
      const onlySuggested = seedLink({ url: "https://a.test/2" });
      const unrelated = seedLink({ url: "https://a.test/3" });
      const tag = seedTag("focus", 1);
      tagLink(applied, tag);
      suggest(onlySuggested, { tagId: tag, suggestedName: "focus" });

      const rows = store.query(filteredLinks$("inbox", { tagIds: [tag] }));
      expect(rows.map((r) => r.id).toSorted()).toEqual(
        [applied, onlySuggested].toSorted()
      );
      expect(rows.map((r) => r.id)).not.toContain(unrelated);
    });
  });
});
