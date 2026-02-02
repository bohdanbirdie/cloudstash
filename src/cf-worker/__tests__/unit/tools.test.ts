import { describe, it, expect, vi, beforeEach } from "vitest";

// Create mock query symbols using vi.hoisted so they're available before vi.mock runs
const mockQueries = vi.hoisted(() => ({
  allLinks$: Symbol("allLinks$"),
  allLinksCount$: Symbol("allLinksCount$"),
  completedCount$: Symbol("completedCount$"),
  inboxCount$: Symbol("inboxCount$"),
  inboxLinks$: Symbol("inboxLinks$"),
  linkById$: (id: string) => ({ __type: "linkById$", id }),
  searchLinks$: (query: string) => ({ __type: "searchLinks$", query }),
}));

// Mock the queries module
vi.mock("../../../livestore/queries", () => mockQueries);

// Mock nanoid for predictable IDs
vi.mock("@livestore/livestore", async () => {
  const actual = await vi.importActual("@livestore/livestore");
  return {
    ...actual,
    nanoid: () => "test-id-123",
  };
});

import { createTools, createToolExecutors } from "../../chat-agent/tools";

// Sample link data for tests
const createLink = (overrides: Record<string, unknown> = {}) => ({
  id: "link-1",
  url: "https://example.com",
  domain: "example.com",
  title: "Example Title",
  description: "Example description",
  summary: "Example summary",
  status: "unread" as const,
  createdAt: new Date("2024-01-01"),
  deletedAt: null as Date | null,
  ...overrides,
});

type LinkData = ReturnType<typeof createLink>;

// Create a mock store with flexible query matching
const createMockStore = () => {
  const committedEvents: unknown[] = [];

  // Store data that queries will access
  let allLinks: LinkData[] = [];
  let inboxLinksData: LinkData[] = [];
  const linksById = new Map<string, LinkData>();
  const searchResults = new Map<string, (LinkData & { score: number })[]>();
  let inboxCount = 0;
  let completedCount = 0;
  let allLinksCount = 0;

  const store = {
    query: vi.fn((queryDef: unknown) => {
      // Match static queries by symbol
      if (queryDef === mockQueries.allLinks$) {
        return allLinks;
      }
      if (queryDef === mockQueries.inboxLinks$) {
        return inboxLinksData;
      }
      if (queryDef === mockQueries.inboxCount$) {
        return inboxCount;
      }
      if (queryDef === mockQueries.completedCount$) {
        return completedCount;
      }
      if (queryDef === mockQueries.allLinksCount$) {
        return allLinksCount;
      }

      // Match parameterized queries by checking __type
      if (
        queryDef &&
        typeof queryDef === "object" &&
        "__type" in queryDef
      ) {
        const typedQuery = queryDef as { __type: string; id?: string; query?: string };
        if (typedQuery.__type === "linkById$" && typedQuery.id) {
          return linksById.get(typedQuery.id) ?? null;
        }
        if (typedQuery.__type === "searchLinks$" && typedQuery.query) {
          return searchResults.get(typedQuery.query) ?? [];
        }
      }

      return undefined;
    }),
    commit: vi.fn((event: unknown) => {
      committedEvents.push(event);
    }),
    // Test helpers for setting up data
    _setAllLinks: (links: LinkData[]) => {
      allLinks = links;
    },
    _setInboxLinks: (links: LinkData[]) => {
      inboxLinksData = links;
    },
    _setLinkById: (id: string, link: LinkData | null) => {
      if (link) {
        linksById.set(id, link);
      } else {
        linksById.delete(id);
      }
    },
    _setSearchResults: (query: string, results: (LinkData & { score: number })[]) => {
      searchResults.set(query, results);
    },
    _setCounts: (inbox: number, completed: number, total: number) => {
      inboxCount = inbox;
      completedCount = completed;
      allLinksCount = total;
    },
    _getCommittedEvents: () => committedEvents,
    _clearCommittedEvents: () => {
      committedEvents.length = 0;
    },
  };

  return store;
};

type MockStore = ReturnType<typeof createMockStore>;

describe("createTools", () => {
  let mockStore: MockStore;
  let tools: ReturnType<typeof createTools>;

  beforeEach(() => {
    mockStore = createMockStore();
    tools = createTools(mockStore as any);
    vi.clearAllMocks();
  });

  describe("listRecentLinks", () => {
    it("returns empty array when no links exist", async () => {
      mockStore._setAllLinks([]);

      const result = await tools.listRecentLinks.execute!({ limit: 5 }, {} as any);

      expect(result).toEqual({ links: [] });
    });

    it("returns links with default limit of 5", async () => {
      const links = Array.from({ length: 10 }, (_, i) =>
        createLink({ id: `link-${i}`, title: `Title ${i}` })
      );
      mockStore._setAllLinks(links);

      const result = await tools.listRecentLinks.execute!({}, {} as any);

      expect(result.links).toHaveLength(5);
      expect(result.links[0].id).toBe("link-0");
    });

    it("respects custom limit", async () => {
      const links = Array.from({ length: 10 }, (_, i) =>
        createLink({ id: `link-${i}` })
      );
      mockStore._setAllLinks(links);

      const result = await tools.listRecentLinks.execute!({ limit: 3 }, {} as any);

      expect(result.links).toHaveLength(3);
    });

    it("caps limit at 20", async () => {
      const links = Array.from({ length: 30 }, (_, i) =>
        createLink({ id: `link-${i}` })
      );
      mockStore._setAllLinks(links);

      const result = await tools.listRecentLinks.execute!({ limit: 100 }, {} as any);

      expect(result.links).toHaveLength(20);
    });

    it("maps link fields correctly", async () => {
      const link = createLink({
        id: "test-id",
        url: "https://test.com",
        title: "Test Title",
        description: "Test desc",
        summary: "Test summary",
      });
      mockStore._setAllLinks([link]);

      const result = await tools.listRecentLinks.execute!({ limit: 5 }, {} as any);

      expect(result.links[0]).toEqual({
        id: "test-id",
        url: "https://test.com",
        title: "Test Title",
        description: "Test desc",
        summary: "Test summary",
      });
    });

    it("uses domain as title fallback", async () => {
      const link = createLink({ title: null, domain: "example.com" });
      mockStore._setAllLinks([link]);

      const result = await tools.listRecentLinks.execute!({ limit: 5 }, {} as any);

      expect(result.links[0].title).toBe("example.com");
    });
  });

  describe("saveLink", () => {
    beforeEach(() => {
      mockStore._setAllLinks([]);
    });

    it("saves a valid URL", async () => {
      const result = await tools.saveLink.execute!(
        { url: "https://example.com/page" },
        {} as any
      );

      expect(result).toEqual({
        success: true,
        linkId: "test-id-123",
        message: 'Saved "https://example.com/page" to workspace',
      });
      expect(mockStore.commit).toHaveBeenCalledTimes(1);
    });

    it("extracts domain without www prefix", async () => {
      await tools.saveLink.execute!(
        { url: "https://www.example.com/page" },
        {} as any
      );

      // The event object structure has args.domain
      expect(mockStore.commit).toHaveBeenCalledTimes(1);
      const commitArg = mockStore.commit.mock.calls[0][0] as {
        args: { domain: string };
      };
      expect(commitArg.args.domain).toBe("example.com");
    });

    it("returns error for invalid URL", async () => {
      const result = await tools.saveLink.execute!(
        { url: "not-a-valid-url" },
        {} as any
      );

      expect(result).toEqual({ success: false, error: "Invalid URL" });
      expect(mockStore.commit).not.toHaveBeenCalled();
    });

    it("returns error for duplicate URL", async () => {
      const existingLink = createLink({
        id: "existing-id",
        url: "https://example.com",
      });
      mockStore._setAllLinks([existingLink]);

      const result = await tools.saveLink.execute!(
        { url: "https://example.com" },
        {} as any
      );

      expect(result).toEqual({
        success: false,
        error: "Link already exists",
        existingLinkId: "existing-id",
      });
      expect(mockStore.commit).not.toHaveBeenCalled();
    });
  });

  describe("searchLinks", () => {
    it("returns empty results for no matches", async () => {
      mockStore._setSearchResults("test", []);

      const result = await tools.searchLinks.execute!({ query: "test" }, {} as any);

      expect(result).toEqual({
        query: "test",
        total: 0,
        results: [],
      });
    });

    it("returns search results with scores", async () => {
      const links = [
        { ...createLink({ id: "link-1" }), score: 0.9 },
        { ...createLink({ id: "link-2" }), score: 0.7 },
      ];
      mockStore._setSearchResults("example", links);

      const result = await tools.searchLinks.execute!(
        { query: "example" },
        {} as any
      );

      expect(result.total).toBe(2);
      expect(result.results[0].score).toBe(0.9);
      expect(result.results[1].score).toBe(0.7);
    });

    it("maps result fields correctly", async () => {
      const link = {
        ...createLink({
          id: "search-id",
          url: "https://search.com",
          title: "Search Result",
          description: "Found it",
          summary: "Summary here",
        }),
        score: 0.85,
      };
      mockStore._setSearchResults("query", [link]);

      const result = await tools.searchLinks.execute!({ query: "query" }, {} as any);

      expect(result.results[0]).toEqual({
        id: "search-id",
        url: "https://search.com",
        title: "Search Result",
        description: "Found it",
        summary: "Summary here",
        score: 0.85,
      });
    });
  });

  describe("getLink", () => {
    it("returns link when found", async () => {
      const link = createLink({ id: "found-id" });
      mockStore._setLinkById("found-id", link);

      const result = await tools.getLink.execute!({ id: "found-id" }, {} as any);

      expect(result).toEqual({ link });
    });

    it("returns error when link not found", async () => {
      mockStore._setLinkById("missing-id", null);

      const result = await tools.getLink.execute!({ id: "missing-id" }, {} as any);

      expect(result).toEqual({ error: "Link not found" });
    });
  });

  describe("completeLink", () => {
    it("marks link as completed", async () => {
      const link = createLink({ id: "to-complete", status: "unread" });
      mockStore._setLinkById("to-complete", link);

      const result = await tools.completeLink.execute!(
        { id: "to-complete" },
        {} as any
      );

      expect(result).toEqual({
        success: true,
        message: 'Marked "Example Title" as done',
      });
      expect(mockStore.commit).toHaveBeenCalledTimes(1);
    });

    it("uses URL when title is missing", async () => {
      const link = createLink({
        id: "no-title",
        title: null,
        url: "https://notitle.com",
        status: "unread",
      });
      mockStore._setLinkById("no-title", link);

      const result = await tools.completeLink.execute!(
        { id: "no-title" },
        {} as any
      );

      expect((result as { message: string }).message).toBe('Marked "https://notitle.com" as done');
    });

    it("returns error when link not found", async () => {
      // Don't set any link for "missing"

      const result = await tools.completeLink.execute!({ id: "missing" }, {} as any);

      expect(result).toEqual({ error: "Link not found" });
      expect(mockStore.commit).not.toHaveBeenCalled();
    });

    it("returns error when link is deleted", async () => {
      const link = createLink({
        id: "deleted-link",
        deletedAt: new Date(),
      });
      mockStore._setLinkById("deleted-link", link);

      const result = await tools.completeLink.execute!(
        { id: "deleted-link" },
        {} as any
      );

      expect(result).toEqual({ error: "Cannot complete a deleted link" });
      expect(mockStore.commit).not.toHaveBeenCalled();
    });

    it("returns error when link already completed", async () => {
      const link = createLink({ id: "already-done", status: "completed" });
      mockStore._setLinkById("already-done", link);

      const result = await tools.completeLink.execute!(
        { id: "already-done" },
        {} as any
      );

      expect(result).toEqual({ error: "Link already completed" });
      expect(mockStore.commit).not.toHaveBeenCalled();
    });
  });

  describe("uncompleteLink", () => {
    it("marks completed link as unread", async () => {
      const link = createLink({ id: "to-uncomplete", status: "completed" });
      mockStore._setLinkById("to-uncomplete", link);

      const result = await tools.uncompleteLink.execute!(
        { id: "to-uncomplete" },
        {} as any
      );

      expect(result).toEqual({
        success: true,
        message: 'Marked "Example Title" as unread',
      });
      expect(mockStore.commit).toHaveBeenCalledTimes(1);
    });

    it("returns error when link not found", async () => {
      const result = await tools.uncompleteLink.execute!(
        { id: "missing" },
        {} as any
      );

      expect(result).toEqual({ error: "Link not found" });
    });

    it("returns error when link already unread", async () => {
      const link = createLink({ id: "already-unread", status: "unread" });
      mockStore._setLinkById("already-unread", link);

      const result = await tools.uncompleteLink.execute!(
        { id: "already-unread" },
        {} as any
      );

      expect(result).toEqual({ error: "Link is already unread" });
      expect(mockStore.commit).not.toHaveBeenCalled();
    });
  });

  describe("restoreLink", () => {
    it("restores deleted link", async () => {
      const link = createLink({
        id: "to-restore",
        deletedAt: new Date(),
      });
      mockStore._setLinkById("to-restore", link);

      const result = await tools.restoreLink.execute!(
        { id: "to-restore" },
        {} as any
      );

      expect(result).toEqual({
        success: true,
        message: 'Restored "Example Title"',
      });
      expect(mockStore.commit).toHaveBeenCalledTimes(1);
    });

    it("returns error when link not found", async () => {
      const result = await tools.restoreLink.execute!({ id: "missing" }, {} as any);

      expect(result).toEqual({ error: "Link not found" });
    });

    it("returns error when link is not in trash", async () => {
      const link = createLink({ id: "not-deleted", deletedAt: null });
      mockStore._setLinkById("not-deleted", link);

      const result = await tools.restoreLink.execute!(
        { id: "not-deleted" },
        {} as any
      );

      expect(result).toEqual({ error: "Link is not in trash" });
      expect(mockStore.commit).not.toHaveBeenCalled();
    });
  });

  describe("completeLinks", () => {
    it("completes multiple links", async () => {
      const link1 = createLink({ id: "link-1", status: "unread" });
      const link2 = createLink({ id: "link-2", status: "unread" });
      mockStore._setLinkById("link-1", link1);
      mockStore._setLinkById("link-2", link2);

      const result = await tools.completeLinks.execute!(
        { ids: ["link-1", "link-2"] },
        {} as any
      );

      expect(result).toEqual({
        success: true,
        completed: 2,
        errors: [],
      });
      expect(mockStore.commit).toHaveBeenCalledTimes(2);
    });

    it("tracks not found errors", async () => {
      const result = await tools.completeLinks.execute!(
        { ids: ["missing-1", "missing-2"] },
        {} as any
      );

      expect(result).toEqual({
        success: true,
        completed: 0,
        errors: ["missing-1: not found", "missing-2: not found"],
      });
    });

    it("skips already completed links", async () => {
      const link = createLink({ id: "already-done", status: "completed" });
      mockStore._setLinkById("already-done", link);

      const result = await tools.completeLinks.execute!(
        { ids: ["already-done"] },
        {} as any
      );

      expect((result as { completed: number }).completed).toBe(0);
      expect((result as { errors: string[] }).errors).toEqual([]);
      expect(mockStore.commit).not.toHaveBeenCalled();
    });

    it("skips deleted links", async () => {
      const link = createLink({ id: "deleted", deletedAt: new Date() });
      mockStore._setLinkById("deleted", link);

      const result = await tools.completeLinks.execute!(
        { ids: ["deleted"] },
        {} as any
      );

      expect((result as { completed: number }).completed).toBe(0);
      expect(mockStore.commit).not.toHaveBeenCalled();
    });

    it("handles mixed success and failure", async () => {
      const validLink = createLink({ id: "valid", status: "unread" });
      const completedLink = createLink({ id: "completed", status: "completed" });
      mockStore._setLinkById("valid", validLink);
      mockStore._setLinkById("completed", completedLink);
      // "missing" is not set

      const result = await tools.completeLinks.execute!(
        { ids: ["valid", "completed", "missing"] },
        {} as any
      );

      expect(result).toEqual({
        success: true,
        completed: 1,
        errors: ["missing: not found"],
      });
    });
  });

  describe("getInboxLinks", () => {
    it("returns empty array when inbox is empty", async () => {
      mockStore._setInboxLinks([]);

      const result = await tools.getInboxLinks.execute!({ limit: 10 }, {} as any);

      expect(result).toEqual({ links: [], total: 0 });
    });

    it("returns inbox links with default limit of 10", async () => {
      const links = Array.from({ length: 15 }, (_, i) =>
        createLink({ id: `inbox-${i}` })
      );
      mockStore._setInboxLinks(links);

      const result = await tools.getInboxLinks.execute!({}, {} as any);

      expect(result.links).toHaveLength(10);
      expect(result.total).toBe(15);
    });

    it("respects custom limit", async () => {
      const links = Array.from({ length: 10 }, (_, i) =>
        createLink({ id: `inbox-${i}` })
      );
      mockStore._setInboxLinks(links);

      const result = await tools.getInboxLinks.execute!({ limit: 3 }, {} as any);

      expect(result.links).toHaveLength(3);
    });

    it("caps limit at 20", async () => {
      const links = Array.from({ length: 30 }, (_, i) =>
        createLink({ id: `inbox-${i}` })
      );
      mockStore._setInboxLinks(links);

      const result = await tools.getInboxLinks.execute!({ limit: 100 }, {} as any);

      expect(result.links).toHaveLength(20);
    });

    it("maps inbox link fields correctly", async () => {
      const createdAt = new Date("2024-01-15");
      const link = createLink({
        id: "inbox-1",
        url: "https://inbox.com",
        title: "Inbox Item",
        createdAt,
      });
      mockStore._setInboxLinks([link]);

      const result = await tools.getInboxLinks.execute!({ limit: 10 }, {} as any);

      expect(result.links[0]).toEqual({
        id: "inbox-1",
        url: "https://inbox.com",
        title: "Inbox Item",
        createdAt,
      });
    });
  });

  describe("getStats", () => {
    it("returns workspace statistics", async () => {
      mockStore._setCounts(5, 10, 15);

      const result = await tools.getStats.execute!({}, {} as any);

      expect(result).toEqual({
        inbox: 5,
        completed: 10,
        total: 15,
      });
    });

    it("returns zeros when no links exist", async () => {
      mockStore._setCounts(0, 0, 0);

      const result = await tools.getStats.execute!({}, {} as any);

      expect(result).toEqual({
        inbox: 0,
        completed: 0,
        total: 0,
      });
    });
  });
});

describe("createToolExecutors", () => {
  let mockStore: MockStore;
  let executors: ReturnType<typeof createToolExecutors>;

  beforeEach(() => {
    mockStore = createMockStore();
    executors = createToolExecutors(mockStore as any);
    vi.clearAllMocks();
  });

  describe("deleteLink", () => {
    it("deletes a link successfully", async () => {
      const link = createLink({ id: "to-delete", title: "Delete Me" });
      mockStore._setLinkById("to-delete", link);

      const result = await executors.deleteLink({ id: "to-delete" });

      expect(JSON.parse(result)).toEqual({
        success: true,
        message: 'Moved "Delete Me" to trash',
      });
      expect(mockStore.commit).toHaveBeenCalledTimes(1);
    });

    it("uses URL when title is missing", async () => {
      const link = createLink({
        id: "no-title",
        title: null,
        url: "https://notitle.com",
      });
      mockStore._setLinkById("no-title", link);

      const result = await executors.deleteLink({ id: "no-title" });

      expect(JSON.parse(result).message).toBe(
        'Moved "https://notitle.com" to trash'
      );
    });

    it("returns error when link not found", async () => {
      const result = await executors.deleteLink({ id: "missing" });

      expect(JSON.parse(result)).toEqual({ error: "Link not found" });
      expect(mockStore.commit).not.toHaveBeenCalled();
    });

    it("returns error when link already in trash", async () => {
      const link = createLink({ id: "already-deleted", deletedAt: new Date() });
      mockStore._setLinkById("already-deleted", link);

      const result = await executors.deleteLink({ id: "already-deleted" });

      expect(JSON.parse(result)).toEqual({ error: "Link already in trash" });
      expect(mockStore.commit).not.toHaveBeenCalled();
    });
  });

  describe("deleteLinks", () => {
    it("deletes multiple links successfully", async () => {
      const link1 = createLink({ id: "link-1" });
      const link2 = createLink({ id: "link-2" });
      mockStore._setLinkById("link-1", link1);
      mockStore._setLinkById("link-2", link2);

      const result = await executors.deleteLinks({ ids: ["link-1", "link-2"] });

      expect(JSON.parse(result)).toEqual({
        success: true,
        deleted: 2,
        errors: [],
      });
      expect(mockStore.commit).toHaveBeenCalledTimes(2);
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
      const link = createLink({ id: "already-deleted", deletedAt: new Date() });
      mockStore._setLinkById("already-deleted", link);

      const result = await executors.deleteLinks({ ids: ["already-deleted"] });

      expect(JSON.parse(result).deleted).toBe(0);
      expect(JSON.parse(result).errors).toEqual([]);
      expect(mockStore.commit).not.toHaveBeenCalled();
    });

    it("handles mixed success and failure", async () => {
      const validLink = createLink({ id: "valid" });
      const deletedLink = createLink({ id: "deleted", deletedAt: new Date() });
      mockStore._setLinkById("valid", validLink);
      mockStore._setLinkById("deleted", deletedLink);
      // "missing" is not set

      const result = await executors.deleteLinks({
        ids: ["valid", "deleted", "missing"],
      });

      expect(JSON.parse(result)).toEqual({
        success: true,
        deleted: 1,
        errors: ["missing: not found"],
      });
    });
  });
});
