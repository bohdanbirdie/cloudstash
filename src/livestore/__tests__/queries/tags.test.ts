// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  allTags$,
  allTagsWithCounts$,
  newTagSuggestionsWithCountsForStatus$,
  pendingSuggestionsForLink$,
  pendingTagsByLink$,
  tagCounts$,
  tagsByLink$,
  tagsForLink$,
  tagsWithCountsForStatus$,
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

    it("sorts by createdAt DESC", () => {
      seedTag("Banana", 5, new Date("2026-01-03T10:00:00Z"));
      seedTag("apple", 2, new Date("2026-01-01T10:00:00Z"));
      seedTag("Cherry", 8, new Date("2026-01-02T10:00:00Z"));

      const rows = store.query(allTagsWithCounts$);
      expect(rows.map((r) => r.name)).toEqual(["Banana", "Cherry", "apple"]);
    });
  });

  describe("tagsWithCountsForStatus$", () => {
    const completeLink = (id: string, completedAt: Date) =>
      store.commit(events.linkCompleted({ id, completedAt }));

    const deleteLink = (id: string, deletedAt: Date) =>
      store.commit(events.linkDeleted({ id, deletedAt }));

    it("counts only unread, non-deleted links for inbox status", () => {
      const unread = seedLink({ url: "https://a.test/1" });
      const done = seedLink({ url: "https://a.test/2" });
      const trashed = seedLink({ url: "https://a.test/3" });
      const tA = seedTag("A", 1);
      tagLink(unread, tA);
      tagLink(done, tA);
      tagLink(trashed, tA);
      completeLink(done, new Date("2026-01-05T10:00:00Z"));
      deleteLink(trashed, new Date("2026-01-06T10:00:00Z"));

      const rows = store.query(tagsWithCountsForStatus$("inbox"));
      expect(rows.find((r) => r.id === tA)?.count).toBe(1);
    });

    it("counts only completed, non-deleted links for completed status", () => {
      const unread = seedLink({ url: "https://a.test/1" });
      const done1 = seedLink({ url: "https://a.test/2" });
      const done2 = seedLink({ url: "https://a.test/3" });
      const tA = seedTag("A", 1);
      tagLink(unread, tA);
      tagLink(done1, tA);
      tagLink(done2, tA);
      completeLink(done1, new Date("2026-01-05T10:00:00Z"));
      completeLink(done2, new Date("2026-01-05T11:00:00Z"));

      const rows = store.query(tagsWithCountsForStatus$("completed"));
      expect(rows.find((r) => r.id === tA)?.count).toBe(2);
    });

    it("counts only deleted links for archive status", () => {
      const live = seedLink({ url: "https://a.test/1" });
      const trashed = seedLink({ url: "https://a.test/2" });
      const tA = seedTag("A", 1);
      tagLink(live, tA);
      tagLink(trashed, tA);
      deleteLink(trashed, new Date("2026-01-06T10:00:00Z"));

      const rows = store.query(tagsWithCountsForStatus$("archive"));
      expect(rows.find((r) => r.id === tA)?.count).toBe(1);
    });

    it("counts all non-deleted links for all status (regardless of completed)", () => {
      const unread = seedLink({ url: "https://a.test/1" });
      const done = seedLink({ url: "https://a.test/2" });
      const trashed = seedLink({ url: "https://a.test/3" });
      const tA = seedTag("A", 1);
      tagLink(unread, tA);
      tagLink(done, tA);
      tagLink(trashed, tA);
      completeLink(done, new Date("2026-01-05T10:00:00Z"));
      deleteLink(trashed, new Date("2026-01-06T10:00:00Z"));

      const rows = store.query(tagsWithCountsForStatus$("all"));
      expect(rows.find((r) => r.id === tA)?.count).toBe(2);
    });

    it("excludes tags with zero matches on the current status, even if used elsewhere", () => {
      const done = seedLink({ url: "https://a.test/1" });
      const tA = seedTag("only-completed", 1);
      tagLink(done, tA);
      completeLink(done, new Date("2026-01-05T10:00:00Z"));

      const inboxRows = store.query(tagsWithCountsForStatus$("inbox"));
      expect(inboxRows.find((r) => r.id === tA)).toBeUndefined();

      const completedRows = store.query(tagsWithCountsForStatus$("completed"));
      expect(completedRows.find((r) => r.id === tA)?.count).toBe(1);
    });

    it("excludes tags that have never been used anywhere", () => {
      const used = seedLink();
      const tUsed = seedTag("used", 1);
      const tUnused = seedTag("unused", 2);
      tagLink(used, tUsed);

      const rows = store.query(tagsWithCountsForStatus$("inbox"));
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(tUsed);
      expect(ids).not.toContain(tUnused);
    });

    it("orders by current-status count desc, then name asc for ties", () => {
      const i1 = seedLink({ url: "https://a.test/1" });
      const i2 = seedLink({ url: "https://a.test/2" });
      const i3 = seedLink({ url: "https://a.test/3" });
      const tHeavy = seedTag("zeta", 1); // 3 inbox links — top despite z-name
      const tTieA = seedTag("alpha", 2); // 1 inbox link
      const tTieB = seedTag("beta", 3); // 1 inbox link — ties with alpha
      tagLink(i1, tHeavy);
      tagLink(i2, tHeavy);
      tagLink(i3, tHeavy);
      tagLink(i1, tTieA);
      tagLink(i2, tTieB);

      const rows = store.query(tagsWithCountsForStatus$("inbox"));
      // count desc puts zeta first; alpha before beta on the count-1 tie.
      expect(rows.map((r) => r.id)).toEqual([tHeavy, tTieA, tTieB]);
      expect(rows.find((r) => r.id === tHeavy)?.count).toBe(3);
    });

    it("prioritizes per status: each page shows only its own tags, by that count", () => {
      const inboxLink = seedLink({ url: "https://a.test/1" });
      const doneA = seedLink({ url: "https://a.test/2" });
      const doneB = seedLink({ url: "https://a.test/3" });
      const tInbox = seedTag("alpha", 1);
      const tCompletedOnly = seedTag("zeta", 2);
      tagLink(inboxLink, tInbox);
      tagLink(doneA, tCompletedOnly);
      tagLink(doneB, tCompletedOnly);
      completeLink(doneA, new Date("2026-01-05T10:00:00Z"));
      completeLink(doneB, new Date("2026-01-05T11:00:00Z"));

      // inbox hides zeta (0 inbox); completed hides alpha (0 completed).
      const inbox = store
        .query(tagsWithCountsForStatus$("inbox"))
        .map((r) => r.id);
      const completed = store
        .query(tagsWithCountsForStatus$("completed"))
        .map((r) => r.id);
      expect(inbox).toEqual([tInbox]);
      expect(completed).toEqual([tCompletedOnly]);
    });

    it("excludes soft-deleted tags", () => {
      const link = seedLink();
      const tA = seedTag("keep", 1);
      const tB = seedTag("drop", 2);
      tagLink(link, tA);
      tagLink(link, tB);
      deleteTag(tB, new Date("2026-01-10T10:00:00Z"));

      const rows = store.query(tagsWithCountsForStatus$("inbox"));
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(tA);
      expect(ids).not.toContain(tB);
    });
  });

  const suggest = (
    linkId: string,
    opts: {
      tagId?: string | null;
      suggestedName: string;
      suggestedAt?: Date;
    }
  ) => {
    const id = testId("sug");
    store.commit(
      events.tagSuggested({
        id,
        linkId,
        tagId: opts.tagId ?? null,
        suggestedName: opts.suggestedName,
        model: "test-model",
        suggestedAt: opts.suggestedAt ?? new Date("2026-01-02T10:00:00Z"),
      })
    );
    return id;
  };

  describe("tagsWithCountsForStatus$ with suggestions", () => {
    it("surfaces an existing tag whose only association is a pending suggestion", () => {
      const link = seedLink();
      const tag = seedTag("focus", 1);
      suggest(link, { tagId: tag, suggestedName: "focus" });

      const rows = store.query(tagsWithCountsForStatus$("inbox"));
      expect(rows.find((r) => r.id === tag)?.count).toBe(1);
    });

    it("counts applied + suggested links as DISTINCT", () => {
      const linkA = seedLink({ url: "https://a.test/1" });
      const linkB = seedLink({ url: "https://a.test/2" });
      const tag = seedTag("focus", 1);
      tagLink(linkA, tag);
      // linkB has it only as a pending suggestion
      suggest(linkB, { tagId: tag, suggestedName: "focus" });
      // linkA also has a redundant pending suggestion — must not double-count
      suggest(linkA, { tagId: tag, suggestedName: "focus" });

      const rows = store.query(tagsWithCountsForStatus$("inbox"));
      expect(rows.find((r) => r.id === tag)?.count).toBe(2);
    });

    it("ignores accepted or dismissed suggestions", () => {
      const link = seedLink();
      const tag = seedTag("focus", 1);
      const s1 = suggest(link, { tagId: tag, suggestedName: "focus" });
      store.commit(events.tagSuggestionDismissed({ id: s1 }));

      const rows = store.query(tagsWithCountsForStatus$("inbox"));
      // No applied + no pending → tag should not surface
      expect(rows.find((r) => r.id === tag)).toBeUndefined();
    });

    it("counts orphan suggestion (tagId=null) whose suggestedName matches a tag's id", () => {
      const link = seedLink();
      // Create a tag whose id is the slug "focus" by using "focus" as name.
      // testId would produce a random id, so seed manually.
      store.commit(
        events.tagCreated({
          id: "focus",
          name: "focus",
          sortOrder: 1,
          createdAt: new Date("2026-01-01T10:00:00Z"),
        })
      );
      suggest(link, { suggestedName: "focus" });

      const rows = store.query(tagsWithCountsForStatus$("inbox"));
      expect(rows.find((r) => r.id === "focus")?.count).toBe(1);
    });

    it("does not double-count when link has both applied tag and orphan suggestion with matching name", () => {
      const link = seedLink();
      store.commit(
        events.tagCreated({
          id: "focus",
          name: "focus",
          sortOrder: 1,
          createdAt: new Date("2026-01-01T10:00:00Z"),
        })
      );
      tagLink(link, "focus");
      suggest(link, { suggestedName: "focus" });

      const rows = store.query(tagsWithCountsForStatus$("inbox"));
      expect(rows.find((r) => r.id === "focus")?.count).toBe(1);
    });
  });

  describe("newTagSuggestionsWithCountsForStatus$", () => {
    it("returns rows for tagId=null suggestions grouped by suggestedName", () => {
      const linkA = seedLink({ url: "https://a.test/1" });
      const linkB = seedLink({ url: "https://a.test/2" });
      const linkC = seedLink({ url: "https://a.test/3" });
      suggest(linkA, { suggestedName: "bullmq" });
      suggest(linkB, { suggestedName: "bullmq" });
      suggest(linkC, { suggestedName: "fastify" });

      const rows = store.query(newTagSuggestionsWithCountsForStatus$("inbox"));
      const byName = Object.fromEntries(rows.map((r) => [r.name, r.count]));
      expect(byName["bullmq"]).toBe(2);
      expect(byName["fastify"]).toBe(1);
    });

    it("uses suggestedName as the id (slug-based, not row id)", () => {
      const link = seedLink();
      suggest(link, { suggestedName: "react-hooks" });

      const rows = store.query(newTagSuggestionsWithCountsForStatus$("inbox"));
      expect(rows[0]?.id).toBe("react-hooks");
      expect(rows[0]?.name).toBe("react-hooks");
    });

    it("respects link status filter", () => {
      const inboxLink = seedLink({ url: "https://a.test/1" });
      const completedLink = seedLink({ url: "https://a.test/2" });
      suggest(inboxLink, { suggestedName: "bullmq" });
      suggest(completedLink, { suggestedName: "bullmq" });
      store.commit(
        events.linkCompleted({
          id: completedLink,
          completedAt: new Date("2026-01-05T10:00:00Z"),
        })
      );

      const inboxRows = store.query(
        newTagSuggestionsWithCountsForStatus$("inbox")
      );
      expect(inboxRows.find((r) => r.name === "bullmq")?.count).toBe(1);
      const completedRows = store.query(
        newTagSuggestionsWithCountsForStatus$("completed")
      );
      expect(completedRows.find((r) => r.name === "bullmq")?.count).toBe(1);
    });

    it("excludes existing-tag suggestions (only tagId IS NULL)", () => {
      const link = seedLink();
      const tag = seedTag("focus", 1);
      suggest(link, { tagId: tag, suggestedName: "focus" });

      const rows = store.query(newTagSuggestionsWithCountsForStatus$("inbox"));
      expect(rows).toEqual([]);
    });

    it("excludes dismissed suggestions", () => {
      const link = seedLink();
      const s = suggest(link, { suggestedName: "bullmq" });
      store.commit(events.tagSuggestionDismissed({ id: s }));

      const rows = store.query(newTagSuggestionsWithCountsForStatus$("inbox"));
      expect(rows).toEqual([]);
    });

    it("caps to top 8 by count", () => {
      // 10 distinct new-tag suggestions, each on its own link
      for (let i = 0; i < 10; i++) {
        const link = seedLink({ url: `https://a.test/${i}` });
        suggest(link, { suggestedName: `tag-${String(i).padStart(2, "0")}` });
      }

      const rows = store.query(newTagSuggestionsWithCountsForStatus$("inbox"));
      expect(rows.length).toBe(8);
    });

    it("excludes orphan suggestions whose suggestedName matches an existing tag's id", () => {
      const link = seedLink();
      store.commit(
        events.tagCreated({
          id: "bullmq",
          name: "bullmq",
          sortOrder: 1,
          createdAt: new Date("2026-01-01T10:00:00Z"),
        })
      );
      suggest(link, { suggestedName: "bullmq" });

      const rows = store.query(newTagSuggestionsWithCountsForStatus$("inbox"));
      expect(rows).toEqual([]);
    });

    it("still surfaces orphan suggestion when the colliding tag is soft-deleted", () => {
      const link = seedLink();
      store.commit(
        events.tagCreated({
          id: "bullmq",
          name: "bullmq",
          sortOrder: 1,
          createdAt: new Date("2026-01-01T10:00:00Z"),
        })
      );
      deleteTag("bullmq", new Date("2026-01-10T10:00:00Z"));
      suggest(link, { suggestedName: "bullmq" });

      const rows = store.query(newTagSuggestionsWithCountsForStatus$("inbox"));
      expect(rows.find((r) => r.name === "bullmq")?.count).toBe(1);
    });
  });

  describe("pendingTagsByLink$", () => {
    it("returns existing-tag suggestion using the tag's id and name", () => {
      const link = seedLink();
      const tag = seedTag("focus", 5);
      suggest(link, { tagId: tag, suggestedName: "focus" });

      const rows = store.query(pendingTagsByLink$);
      const linkRows = rows.filter((r) => r.linkId === link);
      expect(linkRows).toHaveLength(1);
      expect(linkRows[0]?.id).toBe(tag);
      expect(linkRows[0]?.name).toBe("focus");
    });

    it("returns new-tag suggestion using suggestedName as id", () => {
      const link = seedLink();
      suggest(link, { suggestedName: "bullmq" });

      const rows = store.query(pendingTagsByLink$);
      const linkRows = rows.filter((r) => r.linkId === link);
      expect(linkRows[0]?.id).toBe("bullmq");
      expect(linkRows[0]?.name).toBe("bullmq");
    });

    it("skips suggestions whose tagId is already applied to that link", () => {
      const link = seedLink();
      const tag = seedTag("focus", 1);
      tagLink(link, tag);
      suggest(link, { tagId: tag, suggestedName: "focus" });

      const rows = store.query(pendingTagsByLink$);
      expect(rows.filter((r) => r.linkId === link)).toEqual([]);
    });

    it("excludes dismissed and accepted suggestions", () => {
      const link = seedLink();
      const s1 = suggest(link, { suggestedName: "a" });
      const s2 = suggest(link, { suggestedName: "b" });
      store.commit(events.tagSuggestionDismissed({ id: s1 }));
      store.commit(events.tagSuggestionAccepted({ id: s2 }));

      const rows = store.query(pendingTagsByLink$);
      expect(rows.filter((r) => r.linkId === link)).toEqual([]);
    });

    it("excludes suggestions where the underlying tag is soft-deleted", () => {
      const link = seedLink();
      const tag = seedTag("focus", 1);
      suggest(link, { tagId: tag, suggestedName: "focus" });
      deleteTag(tag, new Date("2026-01-10T10:00:00Z"));

      const rows = store.query(pendingTagsByLink$);
      expect(rows.filter((r) => r.linkId === link)).toEqual([]);
    });

    it("promotes orphan suggestion to existing tag when suggestedName matches the tag's id", () => {
      const link = seedLink();
      store.commit(
        events.tagCreated({
          id: "focus",
          name: "focus",
          sortOrder: 7,
          createdAt: new Date("2026-01-01T10:00:00Z"),
        })
      );
      suggest(link, { suggestedName: "focus" });

      const rows = store.query(pendingTagsByLink$);
      const linkRows = rows.filter((r) => r.linkId === link);
      expect(linkRows).toHaveLength(1);
      // The promoted row uses the existing tag's metadata, not synthetic
      // suggestion-only values.
      expect(linkRows[0]?.id).toBe("focus");
      expect(linkRows[0]?.name).toBe("focus");
      expect(linkRows[0]?.sortOrder).toBe(7);
    });

    it("skips orphan suggestion whose suggestedName matches a tag already applied to that link", () => {
      const link = seedLink();
      store.commit(
        events.tagCreated({
          id: "focus",
          name: "focus",
          sortOrder: 1,
          createdAt: new Date("2026-01-01T10:00:00Z"),
        })
      );
      tagLink(link, "focus");
      suggest(link, { suggestedName: "focus" });

      const rows = store.query(pendingTagsByLink$);
      expect(rows.filter((r) => r.linkId === link)).toEqual([]);
    });
  });

  describe("tagsByLink$ remains applied-only", () => {
    it("does not include pending suggestions", () => {
      const link = seedLink();
      const tag = seedTag("focus", 1);
      suggest(link, { tagId: tag, suggestedName: "focus" });

      const rows = store.query(tagsByLink$);
      expect(rows.filter((r) => r.linkId === link)).toEqual([]);
    });
  });

  describe("pendingSuggestionsForLink$", () => {
    it("returns only pending suggestions sorted by suggestedAt ASC", () => {
      const link = seedLink();
      const s1 = suggest(link, {
        suggestedName: "first",
        suggestedAt: new Date("2026-01-02T10:00:00Z"),
      });
      const s2 = suggest(link, {
        suggestedName: "second",
        suggestedAt: new Date("2026-01-01T10:00:00Z"),
      });
      const s3 = suggest(link, {
        suggestedName: "third",
        suggestedAt: new Date("2026-01-03T10:00:00Z"),
      });

      store.commit(events.tagSuggestionAccepted({ id: s1 }));
      store.commit(events.tagSuggestionDismissed({ id: s3 }));

      const rows = store.query(pendingSuggestionsForLink$(link));
      expect(rows.map((r) => r.id)).toEqual([s2]);
    });

    it("scopes by linkId", () => {
      const linkA = seedLink({ url: "https://a.test/1" });
      const linkB = seedLink({ url: "https://a.test/2" });
      suggest(linkA, { suggestedName: "a" });
      const sB = suggest(linkB, { suggestedName: "b" });

      const rows = store.query(pendingSuggestionsForLink$(linkB));
      expect(rows.map((r) => r.id)).toEqual([sB]);
    });

    it("returns empty when link has no suggestions", () => {
      const link = seedLink();
      expect(store.query(pendingSuggestionsForLink$(link))).toEqual([]);
    });
  });
});
