// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  allTags$,
  allTagsWithCounts$,
  pendingSuggestionsForLink$,
  tagCounts$,
  tagsForLink$,
} from "../../queries/tags";
import { events } from "../../schema";
import { makeTestStore, testId } from "../test-helpers";
import type { TestStore } from "../test-helpers";

describe("tags queries", () => {
  let store: TestStore;

  beforeEach(async () => {
    store = await makeTestStore();
  });

  afterEach(async () => {
    await store.shutdownPromise?.();
  });

  const seedLink = (overrides: Partial<{ id: string; url: string }> = {}) => {
    const id = overrides.id ?? testId("link");
    store.commit(
      events.linkCreatedV2({
        id,
        url: overrides.url ?? `https://example.com/${id}`,
        domain: "example.com",
        createdAt: new Date("2026-01-01T10:00:00Z"),
        source: "manual",
        sourceMeta: null,
      })
    );
    return id;
  };

  const seedTag = (name: string, sortOrder: number, createdAt?: Date) => {
    const id = testId("tag");
    store.commit(
      events.tagCreated({
        id,
        name,
        sortOrder,
        createdAt: createdAt ?? new Date("2026-01-01T10:00:00Z"),
      })
    );
    return id;
  };

  const tagLink = (linkId: string, tagId: string) => {
    const id = testId("lt");
    store.commit(
      events.linkTagged({
        id,
        linkId,
        tagId,
        createdAt: new Date("2026-01-02T10:00:00Z"),
      })
    );
    return id;
  };

  const deleteTag = (tagId: string, deletedAt: Date) =>
    store.commit(events.tagDeleted({ id: tagId, deletedAt }));

  describe("allTags$", () => {
    it("returns non-deleted tags in sortOrder ASC", () => {
      const a = seedTag("Alpha", 3);
      const b = seedTag("Beta", 1);
      const c = seedTag("Gamma", 2);
      const rows = store.query(allTags$);
      expect(rows.map((t) => t.id)).toEqual([b, c, a]);
    });

    it("excludes soft-deleted tags", () => {
      const a = seedTag("Alpha", 1);
      const b = seedTag("Beta", 2);
      deleteTag(b, new Date("2026-01-10T10:00:00Z"));

      const rows = store.query(allTags$);
      expect(rows.map((t) => t.id)).toEqual([a]);
    });
  });

  describe("tagsForLink$", () => {
    it("returns tags attached to a link in sortOrder ASC", () => {
      const link = seedLink();
      const t1 = seedTag("Alpha", 2);
      const t2 = seedTag("Beta", 1);
      tagLink(link, t1);
      tagLink(link, t2);

      const rows = store.query(tagsForLink$(link));
      expect(rows.map((t) => t.id)).toEqual([t2, t1]);
    });

    it("excludes soft-deleted tags", () => {
      const link = seedLink();
      const t1 = seedTag("Alpha", 1);
      const t2 = seedTag("Beta", 2);
      tagLink(link, t1);
      tagLink(link, t2);
      deleteTag(t2, new Date("2026-01-10T10:00:00Z"));

      const rows = store.query(tagsForLink$(link));
      expect(rows.map((t) => t.id)).toEqual([t1]);
    });

    it("returns empty for a link with no tags", () => {
      const link = seedLink();
      seedTag("Alpha", 1);
      expect(store.query(tagsForLink$(link))).toEqual([]);
    });
  });

  describe("tagCounts$", () => {
    it("counts link_tags per tag, excluding deleted links and deleted tags", () => {
      const link1 = seedLink({ url: "https://a.test/1" });
      const link2 = seedLink({ url: "https://a.test/2" });
      const link3 = seedLink({ url: "https://a.test/3" });
      const tA = seedTag("A", 1);
      const tB = seedTag("B", 2);
      const tC = seedTag("C", 3);
      tagLink(link1, tA);
      tagLink(link2, tA);
      tagLink(link3, tA);
      tagLink(link1, tB);
      tagLink(link2, tC);

      // Soft-delete link2 and tag C.
      store.commit(
        events.linkDeleted({
          id: link2,
          deletedAt: new Date("2026-01-10T10:00:00Z"),
        })
      );
      deleteTag(tC, new Date("2026-01-10T10:00:00Z"));

      const rows = store.query(tagCounts$);
      const byId = Object.fromEntries(rows.map((r) => [r.tagId, r.count]));
      expect(byId[tA]).toBe(2); // link1, link3
      expect(byId[tB]).toBe(1); // link1
      expect(byId[tC]).toBeUndefined(); // tag soft-deleted, excluded
    });
  });

  describe("allTagsWithCounts$", () => {
    it("includes all non-deleted tags; tags with 0 links get count 0 via COALESCE", () => {
      const link = seedLink();
      const tA = seedTag("alpha", 1);
      const tB = seedTag("beta", 2);
      seedTag("gamma", 3); // no links
      tagLink(link, tA);
      tagLink(link, tB);

      const rows = store.query(allTagsWithCounts$);
      const byId = Object.fromEntries(rows.map((r) => [r.id, r.count]));
      expect(byId[tA]).toBe(1);
      expect(byId[tB]).toBe(1);
      expect(rows.find((r) => r.name === "gamma")?.count).toBe(0);
    });

    it("excludes soft-deleted tags", () => {
      const tA = seedTag("keep", 1);
      const tB = seedTag("drop", 2);
      deleteTag(tB, new Date("2026-01-10T10:00:00Z"));

      const rows = store.query(allTagsWithCounts$);
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(tA);
      expect(ids).not.toContain(tB);
    });

    it("sorts by LOWER(name) ASC", () => {
      seedTag("Banana", 5);
      seedTag("apple", 2);
      seedTag("Cherry", 8);

      const rows = store.query(allTagsWithCounts$);
      expect(rows.map((r) => r.name)).toEqual(["apple", "Banana", "Cherry"]);
    });
  });

  describe("pendingSuggestionsForLink$", () => {
    const suggest = (
      linkId: string,
      suggestedName: string,
      suggestedAt: Date
    ) => {
      const id = testId("sug");
      store.commit(
        events.tagSuggested({
          id,
          linkId,
          tagId: null,
          suggestedName,
          model: "test-model",
          suggestedAt,
        })
      );
      return id;
    };

    it("returns only pending suggestions sorted by suggestedAt ASC", () => {
      const link = seedLink();
      const s1 = suggest(link, "first", new Date("2026-01-02T10:00:00Z"));
      const s2 = suggest(link, "second", new Date("2026-01-01T10:00:00Z"));
      const s3 = suggest(link, "third", new Date("2026-01-03T10:00:00Z"));

      store.commit(events.tagSuggestionAccepted({ id: s1 }));
      store.commit(events.tagSuggestionDismissed({ id: s3 }));

      const rows = store.query(pendingSuggestionsForLink$(link));
      expect(rows.map((r) => r.id)).toEqual([s2]);
    });

    it("scopes by linkId", () => {
      const linkA = seedLink({ url: "https://a.test/1" });
      const linkB = seedLink({ url: "https://a.test/2" });
      suggest(linkA, "a", new Date("2026-01-01T10:00:00Z"));
      const sB = suggest(linkB, "b", new Date("2026-01-01T10:00:00Z"));

      const rows = store.query(pendingSuggestionsForLink$(linkB));
      expect(rows.map((r) => r.id)).toEqual([sB]);
    });

    it("returns empty when link has no suggestions", () => {
      const link = seedLink();
      expect(store.query(pendingSuggestionsForLink$(link))).toEqual([]);
    });
  });
});
