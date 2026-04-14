// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  allLinks$,
  allLinksCount$,
  completedCount$,
  completedLinks$,
  inboxCount$,
  inboxLinks$,
  linkById$,
  linkByUrl$,
  linksByIds$,
  recentlyOpenedLinks$,
  searchLinks$,
  trashCount$,
  trashLinks$,
} from "../../queries/links";
import { events } from "../../schema";
import { makeTestStore, testId } from "../test-helpers";
import type { TestStore } from "../test-helpers";

describe("links queries", () => {
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
      domain: string;
      createdAt: Date;
      source: string;
      sourceMeta: string | null;
    }> = {}
  ) => {
    const id = overrides.id ?? testId("link");
    store.commit(
      events.linkCreatedV2({
        id,
        url: overrides.url ?? `https://example.com/${id}`,
        domain: overrides.domain ?? "example.com",
        createdAt: overrides.createdAt ?? new Date("2026-01-01T10:00:00Z"),
        source: overrides.source ?? "manual",
        sourceMeta: overrides.sourceMeta ?? null,
      })
    );
    return id;
  };

  const completeLink = (id: string, completedAt: Date) =>
    store.commit(events.linkCompleted({ id, completedAt }));

  const deleteLink = (id: string, deletedAt: Date) =>
    store.commit(events.linkDeleted({ id, deletedAt }));

  const addSnapshot = (
    linkId: string,
    fetchedAt: Date,
    fields: {
      title?: string | null;
      description?: string | null;
      image?: string | null;
      favicon?: string | null;
    } = {}
  ) => {
    store.commit(
      events.linkMetadataFetched({
        id: testId("snap"),
        linkId,
        title: fields.title ?? null,
        description: fields.description ?? null,
        image: fields.image ?? null,
        favicon: fields.favicon ?? null,
        fetchedAt,
      })
    );
  };

  const addSummary = (linkId: string, summarizedAt: Date, summary: string) => {
    store.commit(
      events.linkSummarized({
        id: testId("sum"),
        linkId,
        summary,
        model: "test-model",
        summarizedAt,
      })
    );
  };

  describe("count queries", () => {
    it("inboxCount$ counts only unread, non-deleted", () => {
      const a = seedLink();
      seedLink();
      const c = seedLink();
      completeLink(a, new Date("2026-01-02T10:00:00Z"));
      deleteLink(c, new Date("2026-01-03T10:00:00Z"));

      expect(store.query(inboxCount$)).toBe(1);
    });

    it("completedCount$ counts completed, non-deleted only", () => {
      const a = seedLink();
      const b = seedLink();
      const c = seedLink();
      completeLink(a, new Date("2026-01-02T10:00:00Z"));
      completeLink(b, new Date("2026-01-02T11:00:00Z"));
      completeLink(c, new Date("2026-01-02T12:00:00Z"));
      deleteLink(c, new Date("2026-01-03T10:00:00Z"));

      expect(store.query(completedCount$)).toBe(2);
    });

    it("allLinksCount$ counts all non-deleted regardless of status", () => {
      const a = seedLink();
      seedLink();
      const c = seedLink();
      completeLink(a, new Date("2026-01-02T10:00:00Z"));
      deleteLink(c, new Date("2026-01-03T10:00:00Z"));

      expect(store.query(allLinksCount$)).toBe(2);
    });

    it("trashCount$ counts soft-deleted only", () => {
      seedLink();
      const b = seedLink();
      const c = seedLink();
      deleteLink(b, new Date("2026-01-03T10:00:00Z"));
      deleteLink(c, new Date("2026-01-04T10:00:00Z"));

      expect(store.query(trashCount$)).toEqual({ count: 2 });
    });
  });

  describe("list queries with snapshot/summary joins", () => {
    it("inboxLinks$ picks the latest snapshot and summary per link", () => {
      const id = seedLink();
      addSnapshot(id, new Date("2026-01-02T10:00:00Z"), { title: "old title" });
      addSnapshot(id, new Date("2026-01-04T10:00:00Z"), { title: "new title" });
      addSnapshot(id, new Date("2026-01-03T10:00:00Z"), { title: "mid title" });
      addSummary(id, new Date("2026-01-02T10:00:00Z"), "old summary");
      addSummary(id, new Date("2026-01-05T10:00:00Z"), "new summary");

      const rows = store.query(inboxLinks$);
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("new title");
      expect(rows[0].summary).toBe("new summary");
    });

    it("inboxLinks$ returns rows sorted by createdAt DESC and excludes non-unread/deleted", () => {
      const a = seedLink({ createdAt: new Date("2026-01-01T10:00:00Z") });
      const b = seedLink({ createdAt: new Date("2026-01-03T10:00:00Z") });
      const c = seedLink({ createdAt: new Date("2026-01-02T10:00:00Z") });
      const d = seedLink({ createdAt: new Date("2026-01-04T10:00:00Z") });
      completeLink(c, new Date("2026-01-05T10:00:00Z"));
      deleteLink(d, new Date("2026-01-05T10:00:00Z"));

      const rows = store.query(inboxLinks$);
      expect(rows.map((r) => r.id)).toEqual([b, a]);
    });

    it("completedLinks$ returns rows sorted by completedAt DESC", () => {
      const a = seedLink();
      const b = seedLink();
      const c = seedLink();
      completeLink(a, new Date("2026-01-04T10:00:00Z"));
      completeLink(b, new Date("2026-01-02T10:00:00Z"));
      completeLink(c, new Date("2026-01-03T10:00:00Z"));

      const rows = store.query(completedLinks$);
      expect(rows.map((r) => r.id)).toEqual([a, c, b]);
    });

    it("completedLinks$ excludes deleted links", () => {
      const a = seedLink();
      const b = seedLink();
      completeLink(a, new Date("2026-01-04T10:00:00Z"));
      completeLink(b, new Date("2026-01-02T10:00:00Z"));
      deleteLink(b, new Date("2026-01-05T10:00:00Z"));

      const rows = store.query(completedLinks$);
      expect(rows.map((r) => r.id)).toEqual([a]);
    });

    it("allLinks$ returns all non-deleted, sorted by createdAt DESC", () => {
      const a = seedLink({ createdAt: new Date("2026-01-01T10:00:00Z") });
      const b = seedLink({ createdAt: new Date("2026-01-03T10:00:00Z") });
      const c = seedLink({ createdAt: new Date("2026-01-02T10:00:00Z") });
      completeLink(c, new Date("2026-01-05T10:00:00Z"));
      const d = seedLink({ createdAt: new Date("2026-01-04T10:00:00Z") });
      deleteLink(d, new Date("2026-01-05T10:00:00Z"));

      const rows = store.query(allLinks$);
      expect(rows.map((r) => r.id)).toEqual([b, c, a]);
    });

    it("trashLinks$ returns soft-deleted links sorted by deletedAt DESC", () => {
      const a = seedLink();
      const b = seedLink();
      const c = seedLink();
      deleteLink(a, new Date("2026-01-03T10:00:00Z"));
      deleteLink(b, new Date("2026-01-05T10:00:00Z"));
      deleteLink(c, new Date("2026-01-04T10:00:00Z"));

      const rows = store.query(trashLinks$);
      expect(rows.map((r) => r.id)).toEqual([b, c, a]);
    });
  });

  describe("parameterized queries", () => {
    it("linkById$ returns one row", () => {
      const id = seedLink();
      addSnapshot(id, new Date("2026-01-02T10:00:00Z"), { title: "hello" });

      const row = store.query(linkById$(id));
      expect(row).not.toBeNull();
      expect(row!.id).toBe(id);
      expect(row!.title).toBe("hello");
    });

    it("linkById$ returns null for nonexistent id", () => {
      seedLink();
      const row = store.query(linkById$("no-such-link"));
      expect(row).toBeNull();
    });

    it("linkById$ returns a soft-deleted link (no deletedAt filter)", () => {
      const id = seedLink();
      store.commit(
        events.linkDeleted({
          id,
          deletedAt: new Date("2026-02-01T00:00:00Z"),
        })
      );
      const row = store.query(linkById$(id));
      expect(row).not.toBeNull();
      expect(row!.id).toBe(id);
      expect(row!.deletedAt).not.toBeNull();
    });

    it("linkById$ returns null snapshot/summary fields when joins are empty", () => {
      const id = seedLink();
      const row = store.query(linkById$(id));
      expect(row).not.toBeNull();
      expect(row!.title).toBeNull();
      expect(row!.description).toBeNull();
      expect(row!.summary).toBeNull();
      expect(row!.image).toBeNull();
      expect(row!.favicon).toBeNull();
    });

    it("linkByUrl$ returns a row matching the url", () => {
      const id = seedLink({ url: "https://example.com/specific" });
      const row = store.query(linkByUrl$("https://example.com/specific"));
      expect(row).not.toBeNull();
      expect(row!.id).toBe(id);
    });

    it("linkByUrl$ returns null for nonexistent url", () => {
      seedLink();
      const row = store.query(linkByUrl$("https://nope.example/"));
      expect(row).toBeNull();
    });

    it("linksByIds$ returns exactly the requested ids", () => {
      const a = seedLink();
      const b = seedLink();
      const c = seedLink();
      const rows = store.query(linksByIds$([a, c]));
      const ids = rows.map((r) => r.id).toSorted();
      expect(ids).toEqual([a, c].toSorted());
      expect(ids).not.toContain(b);
    });

    it("linksByIds$ returns empty array when called with empty list", () => {
      seedLink();
      const rows = store.query(linksByIds$([]));
      expect(rows).toEqual([]);
    });
  });

  describe("recentlyOpenedLinks$", () => {
    const interact = (linkId: string, type: string, occurredAt: Date) =>
      store.commit(
        events.linkInteracted({
          id: testId("intx"),
          linkId,
          type,
          occurredAt,
        })
      );

    it("groups by linkId and picks latest opened interaction", () => {
      const a = seedLink();
      const b = seedLink();
      const c = seedLink();
      interact(a, "opened", new Date("2026-01-01T10:00:00Z"));
      interact(a, "opened", new Date("2026-01-03T10:00:00Z"));
      interact(b, "opened", new Date("2026-01-02T10:00:00Z"));
      interact(c, "clicked", new Date("2026-01-05T10:00:00Z")); // non-opened

      const rows = store.query(recentlyOpenedLinks$);
      expect(rows.map((r) => r.id)).toEqual([a, b]);
    });

    it("limits to 10 results", () => {
      for (let i = 0; i < 12; i++) {
        const id = seedLink();
        interact(
          id,
          "opened",
          new Date(`2026-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`)
        );
      }
      const rows = store.query(recentlyOpenedLinks$);
      expect(rows).toHaveLength(10);
    });

    it("excludes soft-deleted links", () => {
      const a = seedLink();
      const b = seedLink();
      interact(a, "opened", new Date("2026-01-01T10:00:00Z"));
      interact(b, "opened", new Date("2026-01-02T10:00:00Z"));
      deleteLink(b, new Date("2026-01-05T10:00:00Z"));

      const rows = store.query(recentlyOpenedLinks$);
      expect(rows.map((r) => r.id)).toEqual([a]);
    });
  });

  describe("searchLinks$ weighted scoring", () => {
    it("ranks by weight: title > domain > description > summary > url", () => {
      // Each seeded link has a unique field that matches "zebra".
      const titleOnly = seedLink({
        url: "https://a.test/page",
        domain: "a.test",
      });
      addSnapshot(titleOnly, new Date("2026-01-02T10:00:00Z"), {
        title: "zebra stripes",
        description: "some text",
      });
      addSummary(titleOnly, new Date("2026-01-02T10:00:00Z"), "animals");

      const domainOnly = seedLink({
        url: "https://zebra.test/page",
        domain: "zebra.test",
      });
      addSnapshot(domainOnly, new Date("2026-01-02T10:00:00Z"), {
        title: "home",
        description: "welcome",
      });
      addSummary(domainOnly, new Date("2026-01-02T10:00:00Z"), "the site");

      const descOnly = seedLink({
        url: "https://b.test/page",
        domain: "b.test",
      });
      addSnapshot(descOnly, new Date("2026-01-02T10:00:00Z"), {
        title: "about",
        description: "photos of a zebra",
      });
      addSummary(descOnly, new Date("2026-01-02T10:00:00Z"), "about page");

      const summaryOnly = seedLink({
        url: "https://c.test/page",
        domain: "c.test",
      });
      addSnapshot(summaryOnly, new Date("2026-01-02T10:00:00Z"), {
        title: "misc",
        description: "info",
      });
      addSummary(
        summaryOnly,
        new Date("2026-01-02T10:00:00Z"),
        "discusses the zebra ecosystem"
      );

      const urlOnly = seedLink({
        url: "https://d.test/zebra-slug",
        domain: "d.test",
      });
      addSnapshot(urlOnly, new Date("2026-01-02T10:00:00Z"), {
        title: "noise",
        description: "info",
      });
      addSummary(urlOnly, new Date("2026-01-02T10:00:00Z"), "body");

      const multi = seedLink({
        url: "https://e.test/zebra-page",
        domain: "zebra.zoo",
      });
      addSnapshot(multi, new Date("2026-01-02T10:00:00Z"), {
        title: "zebra title",
        description: "zebra described",
      });
      addSummary(multi, new Date("2026-01-02T10:00:00Z"), "zebra mentioned");

      const noMatch = seedLink({
        url: "https://f.test/page",
        domain: "f.test",
      });
      addSnapshot(noMatch, new Date("2026-01-02T10:00:00Z"), {
        title: "lion pride",
        description: "hunting",
      });
      addSummary(noMatch, new Date("2026-01-02T10:00:00Z"), "savanna fauna");

      const rows = store.query(searchLinks$("zebra"));
      const ids = rows.map((r) => r.id);

      expect(ids).not.toContain(noMatch);
      expect(ids[0]).toBe(multi); // highest total score
      // Remaining order reflects single-field weights.
      const remaining = ids.slice(1);
      expect(remaining).toEqual([
        titleOnly,
        domainOnly,
        descOnly,
        summaryOnly,
        urlOnly,
      ]);
    });

    it("returns empty result for blank query", () => {
      seedLink();
      expect(store.query(searchLinks$(""))).toEqual([]);
      expect(store.query(searchLinks$("   "))).toEqual([]);
    });

    it("excludes soft-deleted links from search", () => {
      const id = seedLink({
        url: "https://zebra.test/page",
        domain: "zebra.test",
      });
      addSnapshot(id, new Date("2026-01-02T10:00:00Z"), { title: "zebra" });
      deleteLink(id, new Date("2026-01-05T10:00:00Z"));

      const rows = store.query(searchLinks$("zebra"));
      expect(rows).toEqual([]);
    });
  });
});
