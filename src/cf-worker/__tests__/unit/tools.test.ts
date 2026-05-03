// @vitest-environment jsdom
import type { ToolCallOptions } from "ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  makeTestStore,
  testId,
} from "../../../livestore/__tests__/test-helpers";
import type { TestStore } from "../../../livestore/__tests__/test-helpers";
import { events, tables } from "../../../livestore/schema";
import { createTools, createToolExecutors } from "../../chat-agent/tools";

/** Extract direct result from tool execute (not AsyncIterable) */
function unwrap<T>(result: T | AsyncIterable<T>): T {
  return result as T;
}

/** Tool executes don't use their second arg; satisfy the signature with this. */
const stubCtx = {} as ToolCallOptions;

type SeedLinkOptions = {
  id?: string;
  url?: string;
  domain?: string;
  createdAt?: Date;
  title?: string | null;
  description?: string | null;
  summary?: string | null;
  completed?: boolean;
  completedAt?: Date;
  deletedAt?: Date | null;
};

describe("createTools", () => {
  let store: TestStore;
  let tools: ReturnType<typeof createTools>;

  const seedLink = (opts: SeedLinkOptions = {}) => {
    const id = opts.id ?? testId("link");
    const url = opts.url ?? `https://example.com/${id}`;
    const domain = opts.domain ?? "example.com";
    const createdAt = opts.createdAt ?? new Date("2024-01-01T00:00:00Z");

    store.commit(
      events.linkCreatedV2({
        id,
        url,
        domain,
        createdAt,
        source: "test",
        sourceMeta: null,
      })
    );

    if (opts.title !== undefined || opts.description !== undefined) {
      store.commit(
        events.linkMetadataFetched({
          id: testId("snap"),
          linkId: id,
          title: opts.title ?? null,
          description: opts.description ?? null,
          image: null,
          favicon: null,
          fetchedAt: createdAt,
        })
      );
    }

    if (opts.summary !== undefined && opts.summary !== null) {
      store.commit(
        events.linkSummarized({
          id: testId("sum"),
          linkId: id,
          summary: opts.summary,
          model: "test-model",
          summarizedAt: createdAt,
        })
      );
    }

    if (opts.completed) {
      store.commit(
        events.linkCompleted({
          id,
          completedAt: opts.completedAt ?? new Date("2024-01-02T00:00:00Z"),
        })
      );
    }

    if (opts.deletedAt) {
      store.commit(events.linkDeleted({ id, deletedAt: opts.deletedAt }));
    }

    return id;
  };

  beforeEach(async () => {
    store = await makeTestStore();
    tools = createTools(store);
  });

  afterEach(async () => {
    await store.shutdownPromise?.();
  });

  describe("listRecentLinks", () => {
    it("returns empty array when no links exist", async () => {
      const result = await tools.listRecentLinks.execute!(
        { limit: 5 },
        stubCtx
      );

      expect(result).toEqual({ links: [] });
    });

    it("returns links with default limit of 5", async () => {
      for (let i = 0; i < 10; i++) {
        seedLink({ title: `Title ${i}` });
      }

      const result = unwrap(await tools.listRecentLinks.execute!({}, stubCtx));

      expect(result.links).toHaveLength(5);
    });

    it("respects custom limit", async () => {
      for (let i = 0; i < 10; i++) seedLink();

      const result = unwrap(
        await tools.listRecentLinks.execute!({ limit: 3 }, stubCtx)
      );

      expect(result.links).toHaveLength(3);
    });

    it("caps limit at 20", async () => {
      for (let i = 0; i < 30; i++) seedLink();

      const result = unwrap(
        await tools.listRecentLinks.execute!({ limit: 100 }, stubCtx)
      );

      expect(result.links).toHaveLength(20);
    });

    it("maps link fields correctly", async () => {
      const id = seedLink({
        url: "https://test.com",
        title: "Test Title",
        description: "Test desc",
        summary: "Test summary",
      });

      const result = unwrap(
        await tools.listRecentLinks.execute!({ limit: 5 }, stubCtx)
      );

      expect(result.links[0]).toEqual({
        id,
        url: "https://test.com",
        title: "Test Title",
        description: "Test desc",
      });
    });

    it("uses domain as title fallback", async () => {
      seedLink({ title: null, domain: "example.com" });

      const result = unwrap(
        await tools.listRecentLinks.execute!({ limit: 5 }, stubCtx)
      );

      expect(result.links[0].title).toBe("example.com");
    });
  });

  describe("saveLink", () => {
    it("saves a valid URL", async () => {
      const result = (await tools.saveLink.execute!(
        { url: "https://example.com/page" },
        stubCtx
      )) as { success: boolean; linkId: string; message: string };

      expect(result.success).toBe(true);
      expect(typeof result.linkId).toBe("string");
      expect(result.linkId.length).toBeGreaterThan(0);
      expect(result.message).toBe(
        'Saved "https://example.com/page" to workspace'
      );

      // Verify state via query
      const rows = store.query(
        tables.links.where({ url: "https://example.com/page" })
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(result.linkId);
      expect(rows[0].domain).toBe("example.com");
    });

    it("extracts domain without www prefix", async () => {
      await tools.saveLink.execute!(
        { url: "https://www.example.com/page" },
        stubCtx
      );

      const rows = store.query(
        tables.links.where({ url: "https://www.example.com/page" })
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].domain).toBe("example.com");
    });

    it("returns error for invalid URL", async () => {
      const result = await tools.saveLink.execute!(
        { url: "not-a-valid-url" },
        stubCtx
      );

      expect(result).toEqual({ success: false, error: "Invalid URL" });
      // No link committed.
      const rows = store.query(tables.links.where({}));
      expect(rows).toHaveLength(0);
    });

    it("returns error for duplicate URL", async () => {
      const existingId = seedLink({
        url: "https://example.com",
      });

      const result = await tools.saveLink.execute!(
        { url: "https://example.com" },
        stubCtx
      );

      expect(result).toEqual({
        success: false,
        error: "Link already exists",
        existingLinkId: existingId,
      });

      const rows = store.query(
        tables.links.where({ url: "https://example.com" })
      );
      expect(rows).toHaveLength(1);
    });
  });

  describe("searchLinks", () => {
    it("returns empty results for no matches", async () => {
      const result = await tools.searchLinks.execute!(
        { query: "test" },
        stubCtx
      );

      expect(result).toEqual({
        query: "test",
        total: 0,
        results: [],
      });
    });

    it("returns search results with scores", async () => {
      seedLink({
        url: "https://a.test/page",
        domain: "a.test",
        title: "example story",
      });
      seedLink({
        url: "https://b.test/page",
        domain: "b.test",
        title: "another example",
      });

      const result = unwrap(
        await tools.searchLinks.execute!({ query: "example" }, stubCtx)
      );

      expect(result.total).toBe(2);
      expect(result.results[0].score).toBeGreaterThan(0);
      expect(result.results[1].score).toBeGreaterThan(0);
    });

    it("maps result fields correctly", async () => {
      const id = seedLink({
        url: "https://search.com",
        domain: "search.com",
        title: "query term result",
        description: "Found it",
        summary: "Summary here",
      });

      const result = unwrap(
        await tools.searchLinks.execute!({ query: "query" }, stubCtx)
      );

      expect(result.results).toHaveLength(1);
      const r = result.results[0];
      expect(r.id).toBe(id);
      expect(r.url).toBe("https://search.com");
      expect(r.title).toBe("query term result");
      expect(r.description).toBe("Found it");
      expect(r.summary).toBe("Summary here");
      expect(typeof r.score).toBe("number");
      expect(r.score).toBeGreaterThan(0);
    });
  });

  describe("getLink", () => {
    it("returns link when found", async () => {
      const id = seedLink({ title: "Example Title" });

      const result = (await tools.getLink.execute!({ id }, stubCtx)) as {
        link: { id: string; title: string | null };
      };

      expect(result.link.id).toBe(id);
      expect(result.link.title).toBe("Example Title");
    });

    it("returns error when link not found", async () => {
      const result = await tools.getLink.execute!(
        { id: "missing-id" },
        stubCtx
      );

      expect(result).toEqual({ error: "Link not found" });
    });
  });

  describe("completeLink", () => {
    it("marks link as completed", async () => {
      const id = seedLink({ title: "Example Title" });

      const result = await tools.completeLink.execute!({ id }, stubCtx);

      expect(result).toEqual({
        success: true,
        message: 'Marked "Example Title" as done',
      });

      const row = store.query(tables.links.where({ id }))[0];
      expect(row.status).toBe("completed");
      expect(row.completedAt).not.toBeNull();
    });

    it("uses URL when title is missing", async () => {
      const id = seedLink({
        url: "https://notitle.com",
        domain: "notitle.com",
      });

      const result = await tools.completeLink.execute!({ id }, stubCtx);

      expect((result as { message: string }).message).toBe(
        'Marked "https://notitle.com" as done'
      );
    });

    it("returns error when link not found", async () => {
      const result = await tools.completeLink.execute!(
        { id: "missing" },
        stubCtx
      );

      expect(result).toEqual({ error: "Link not found" });
    });

    it("returns error when link is deleted", async () => {
      const id = seedLink({
        title: "Example Title",
        deletedAt: new Date("2024-02-01T00:00:00Z"),
      });

      const result = await tools.completeLink.execute!({ id }, stubCtx);

      expect(result).toEqual({ error: "Cannot complete a deleted link" });
      const row = store.query(tables.links.where({ id }))[0];
      expect(row.status).toBe("unread");
    });

    it("returns error when link already completed", async () => {
      const id = seedLink({ title: "Example Title", completed: true });

      const result = await tools.completeLink.execute!({ id }, stubCtx);

      expect(result).toEqual({ error: "Link already completed" });
    });
  });

  describe("uncompleteLink", () => {
    it("marks completed link as unread", async () => {
      const id = seedLink({ title: "Example Title", completed: true });

      const result = await tools.uncompleteLink.execute!({ id }, stubCtx);

      expect(result).toEqual({
        success: true,
        message: 'Marked "Example Title" as unread',
      });
      const row = store.query(tables.links.where({ id }))[0];
      expect(row.status).toBe("unread");
      expect(row.completedAt).toBeNull();
    });

    it("returns error when link not found", async () => {
      const result = await tools.uncompleteLink.execute!(
        { id: "missing" },
        stubCtx
      );

      expect(result).toEqual({ error: "Link not found" });
    });

    it("returns error when link already unread", async () => {
      const id = seedLink({ title: "Example Title" });

      const result = await tools.uncompleteLink.execute!({ id }, stubCtx);

      expect(result).toEqual({ error: "Link is already unread" });
    });
  });

  describe("restoreLink", () => {
    it("restores deleted link", async () => {
      const id = seedLink({
        title: "Example Title",
        deletedAt: new Date("2024-02-01T00:00:00Z"),
      });

      const result = await tools.restoreLink.execute!({ id }, stubCtx);

      expect(result).toEqual({
        success: true,
        message: 'Restored "Example Title"',
      });
      const row = store.query(tables.links.where({ id }))[0];
      expect(row.deletedAt).toBeNull();
    });

    it("returns error when link not found", async () => {
      const result = await tools.restoreLink.execute!(
        { id: "missing" },
        stubCtx
      );

      expect(result).toEqual({ error: "Link not found" });
    });

    it("returns error when link is not in archive", async () => {
      const id = seedLink({ title: "Example Title" });

      const result = await tools.restoreLink.execute!({ id }, stubCtx);

      expect(result).toEqual({ error: "Link is not in archive" });
    });
  });

  describe("completeLinks", () => {
    it("completes multiple links", async () => {
      const id1 = seedLink({ title: "One" });
      const id2 = seedLink({ title: "Two" });

      const result = await tools.completeLinks.execute!(
        { ids: [id1, id2] },
        stubCtx
      );

      expect(result).toEqual({
        success: true,
        completed: 2,
        errors: [],
      });
      const rows = store.query(tables.links.where({}));
      const statuses = rows.map((r) => r.status).toSorted();
      expect(statuses).toEqual(["completed", "completed"]);
    });

    it("tracks not found errors", async () => {
      const result = await tools.completeLinks.execute!(
        { ids: ["missing-1", "missing-2"] },
        stubCtx
      );

      expect(result).toEqual({
        success: true,
        completed: 0,
        errors: ["missing-1: not found", "missing-2: not found"],
      });
    });

    it("skips already completed links", async () => {
      const id = seedLink({ title: "Done", completed: true });

      const result = await tools.completeLinks.execute!({ ids: [id] }, stubCtx);

      expect((result as { completed: number }).completed).toBe(0);
      expect((result as { errors: string[] }).errors).toEqual([]);
    });

    it("skips deleted links", async () => {
      const id = seedLink({
        title: "Deleted",
        deletedAt: new Date("2024-02-01T00:00:00Z"),
      });

      const result = await tools.completeLinks.execute!({ ids: [id] }, stubCtx);

      expect((result as { completed: number }).completed).toBe(0);
      const row = store.query(tables.links.where({ id }))[0];
      expect(row.status).toBe("unread");
    });

    it("handles mixed success and failure", async () => {
      const valid = seedLink({ title: "Valid" });
      const alreadyDone = seedLink({ title: "AlreadyDone", completed: true });

      const result = await tools.completeLinks.execute!(
        { ids: [valid, alreadyDone, "missing"] },
        stubCtx
      );

      expect(result).toEqual({
        success: true,
        completed: 1,
        errors: ["missing: not found"],
      });
      const validRow = store.query(tables.links.where({ id: valid }))[0];
      expect(validRow.status).toBe("completed");
    });
  });

  describe("getInboxLinks", () => {
    it("returns empty array when inbox is empty", async () => {
      const result = await tools.getInboxLinks.execute!({ limit: 10 }, stubCtx);

      expect(result).toEqual({ links: [], total: 0 });
    });

    it("returns inbox links with default limit of 10", async () => {
      for (let i = 0; i < 15; i++) seedLink();

      const result = unwrap(await tools.getInboxLinks.execute!({}, stubCtx));

      expect(result.links).toHaveLength(10);
      expect(result.total).toBe(15);
    });

    it("respects custom limit", async () => {
      for (let i = 0; i < 10; i++) seedLink();

      const result = unwrap(
        await tools.getInboxLinks.execute!({ limit: 3 }, stubCtx)
      );

      expect(result.links).toHaveLength(3);
    });

    it("caps limit at 20", async () => {
      for (let i = 0; i < 30; i++) seedLink();

      const result = unwrap(
        await tools.getInboxLinks.execute!({ limit: 100 }, stubCtx)
      );

      expect(result.links).toHaveLength(20);
    });

    it("maps inbox link fields correctly", async () => {
      const createdAt = new Date("2024-01-15T00:00:00Z");
      const id = seedLink({
        url: "https://inbox.com",
        domain: "inbox.com",
        createdAt,
        title: "Inbox Item",
      });

      const result = unwrap(
        await tools.getInboxLinks.execute!({ limit: 10 }, stubCtx)
      );

      expect(result.links).toHaveLength(1);
      const r = result.links[0];
      expect(r.id).toBe(id);
      expect(r.url).toBe("https://inbox.com");
      expect(r.title).toBe("Inbox Item");
      expect(new Date(r.createdAt as Date | string | number).getTime()).toBe(
        createdAt.getTime()
      );
    });
  });

  describe("getStats", () => {
    it("returns workspace statistics", async () => {
      // 5 inbox, 10 completed, 15 total
      for (let i = 0; i < 5; i++) seedLink();
      for (let i = 0; i < 10; i++) seedLink({ completed: true });

      const result = await tools.getStats.execute!({}, stubCtx);

      expect(result).toEqual({
        inbox: 5,
        completed: 10,
        total: 15,
      });
    });

    it("returns zeros when no links exist", async () => {
      const result = await tools.getStats.execute!({}, stubCtx);

      expect(result).toEqual({
        inbox: 0,
        completed: 0,
        total: 0,
      });
    });
  });
});

describe("createToolExecutors", () => {
  let store: TestStore;
  let executors: ReturnType<typeof createToolExecutors>;

  const seedLink = (opts: SeedLinkOptions = {}) => {
    const id = opts.id ?? testId("link");
    const url = opts.url ?? `https://example.com/${id}`;
    const domain = opts.domain ?? "example.com";
    const createdAt = opts.createdAt ?? new Date("2024-01-01T00:00:00Z");
    store.commit(
      events.linkCreatedV2({
        id,
        url,
        domain,
        createdAt,
        source: "test",
        sourceMeta: null,
      })
    );
    if (opts.title !== undefined) {
      store.commit(
        events.linkMetadataFetched({
          id: testId("snap"),
          linkId: id,
          title: opts.title,
          description: null,
          image: null,
          favicon: null,
          fetchedAt: createdAt,
        })
      );
    }
    if (opts.deletedAt) {
      store.commit(events.linkDeleted({ id, deletedAt: opts.deletedAt }));
    }
    return id;
  };

  beforeEach(async () => {
    store = await makeTestStore();
    executors = createToolExecutors(store);
  });

  afterEach(async () => {
    await store.shutdownPromise?.();
  });

  describe("deleteLink", () => {
    it("deletes a link successfully", async () => {
      const id = seedLink({ title: "Delete Me" });

      const result = await executors.deleteLink({ id });

      expect(JSON.parse(result)).toEqual({
        success: true,
        message: 'Moved "Delete Me" to archive',
      });
      const row = store.query(tables.links.where({ id }))[0];
      expect(row.deletedAt).not.toBeNull();
    });

    it("uses URL when title is missing", async () => {
      const id = seedLink({
        url: "https://notitle.com",
        domain: "notitle.com",
      });

      const result = await executors.deleteLink({ id });

      expect(JSON.parse(result).message).toBe(
        'Moved "https://notitle.com" to archive'
      );
    });

    it("returns error when link not found", async () => {
      const result = await executors.deleteLink({ id: "missing" });

      expect(JSON.parse(result)).toEqual({ error: "Link not found" });
    });

    it("returns error when link already in archive", async () => {
      const id = seedLink({
        title: "Already",
        deletedAt: new Date("2024-02-01T00:00:00Z"),
      });

      const result = await executors.deleteLink({ id });

      expect(JSON.parse(result)).toEqual({ error: "Link already in archive" });
    });
  });

  describe("deleteLinks", () => {
    it("deletes multiple links successfully", async () => {
      const id1 = seedLink();
      const id2 = seedLink();

      const result = await executors.deleteLinks({ ids: [id1, id2] });

      expect(JSON.parse(result)).toEqual({
        success: true,
        deleted: 2,
        errors: [],
      });
      const rows = store.query(tables.links.where({}));
      for (const row of rows) expect(row.deletedAt).not.toBeNull();
    });

    it("tracks not found errors", async () => {
      const result = await executors.deleteLinks({
        ids: ["missing-1", "missing-2"],
      });

      expect(JSON.parse(result)).toEqual({
        success: true,
        deleted: 0,
        errors: ["missing-1: not found", "missing-2: not found"],
      });
    });

    it("skips already deleted links", async () => {
      const id = seedLink({
        deletedAt: new Date("2024-02-01T00:00:00Z"),
      });

      const result = await executors.deleteLinks({ ids: [id] });

      expect(JSON.parse(result).deleted).toBe(0);
      expect(JSON.parse(result).errors).toEqual([]);
    });

    it("handles mixed success and failure", async () => {
      const valid = seedLink();
      const deleted = seedLink({
        deletedAt: new Date("2024-02-01T00:00:00Z"),
      });

      const result = await executors.deleteLinks({
        ids: [valid, deleted, "missing"],
      });

      expect(JSON.parse(result)).toEqual({
        success: true,
        deleted: 1,
        errors: ["missing: not found"],
      });
      const validRow = store.query(tables.links.where({ id: valid }))[0];
      expect(validRow.deletedAt).not.toBeNull();
    });
  });
});
