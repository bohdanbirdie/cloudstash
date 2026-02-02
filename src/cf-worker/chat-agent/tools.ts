import { nanoid, type Store } from "@livestore/livestore";
import { tool, zodSchema } from "ai";
import { z } from "zod";

import {
  allLinks$,
  allLinksCount$,
  completedCount$,
  inboxCount$,
  inboxLinks$,
  linkById$,
  searchLinks$,
} from "../../livestore/queries";
import { events, schema } from "../../livestore/schema";

const listRecentLinksSchema = z.object({
  limit: z
    .number()
    .optional()
    .describe("Number of links to return (default 5)"),
});

const saveLinkSchema = z.object({
  url: z.string().describe("The URL to save"),
});

const searchLinksSchema = z.object({
  query: z.string().describe("Search query"),
});

const linkIdSchema = z.object({
  id: z.string().describe("Link ID"),
});

const linkIdsSchema = z.object({
  ids: z.array(z.string()).describe("Array of link IDs"),
});

const getInboxSchema = z.object({
  limit: z.number().optional().describe("Max links to return (default 10)"),
});

export function createTools(store: Store<typeof schema>) {
  return {
    listRecentLinks: tool({
      description: "List recently saved links in the workspace",
      inputSchema: zodSchema(listRecentLinksSchema),
      execute: async ({ limit = 5 }) => {
        const links = store.query(allLinks$);
        return {
          links: links.slice(0, Math.min(limit, 20)).map((link) => ({
            id: link.id,
            url: link.url,
            title: link.title || link.domain,
            description: link.description,
            summary: link.summary,
          })),
        };
      },
    }),

    saveLink: tool({
      description: "Save a new link to the workspace",
      inputSchema: zodSchema(saveLinkSchema),
      execute: async ({ url }) => {
        let domain: string;
        try {
          domain = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          return { success: false, error: "Invalid URL" };
        }

        const existing = store.query(allLinks$).find((l) => l.url === url);
        if (existing) {
          return {
            success: false,
            error: "Link already exists",
            existingLinkId: existing.id,
          };
        }

        const linkId = nanoid();
        store.commit(
          events.linkCreated({
            id: linkId,
            url,
            domain,
            createdAt: new Date(),
          })
        );

        return {
          success: true,
          linkId,
          message: `Saved "${url}" to workspace`,
        };
      },
    }),

    searchLinks: tool({
      description: "Search for links by keyword",
      inputSchema: zodSchema(searchLinksSchema),
      execute: async ({ query }) => {
        const results = store.query(searchLinks$(query));
        return {
          results: results.map((link) => ({
            id: link.id,
            url: link.url,
            title: link.title || link.domain,
            score: link.score,
          })),
        };
      },
    }),

    getLink: tool({
      description: "Get details of a specific link by ID",
      inputSchema: zodSchema(linkIdSchema),
      execute: async ({ id }) => {
        const link = store.query(linkById$(id));
        if (!link) return { error: "Link not found" };
        return { link };
      },
    }),

    completeLink: tool({
      description: "Mark a link as completed/done",
      inputSchema: zodSchema(linkIdSchema),
      execute: async ({ id }) => {
        const link = store.query(linkById$(id));
        if (!link) return { error: "Link not found" };
        if (link.deletedAt) return { error: "Cannot complete a deleted link" };
        if (link.status === "completed")
          return { error: "Link already completed" };

        store.commit(events.linkCompleted({ id, completedAt: new Date() }));
        return {
          success: true,
          message: `Marked "${link.title || link.url}" as done`,
        };
      },
    }),

    uncompleteLink: tool({
      description: "Mark a completed link back as unread",
      inputSchema: zodSchema(linkIdSchema),
      execute: async ({ id }) => {
        const link = store.query(linkById$(id));
        if (!link) return { error: "Link not found" };
        if (link.status === "unread") return { error: "Link is already unread" };

        store.commit(events.linkUncompleted({ id }));
        return {
          success: true,
          message: `Marked "${link.title || link.url}" as unread`,
        };
      },
    }),

    // No execute = requires user confirmation
    deleteLink: tool({
      description: "Move a link to trash (requires confirmation)",
      inputSchema: zodSchema(linkIdSchema),
    }),

    restoreLink: tool({
      description: "Restore a link from trash",
      inputSchema: zodSchema(linkIdSchema),
      execute: async ({ id }) => {
        const link = store.query(linkById$(id));
        if (!link) return { error: "Link not found" };
        if (!link.deletedAt) return { error: "Link is not in trash" };

        store.commit(events.linkRestored({ id }));
        return {
          success: true,
          message: `Restored "${link.title || link.url}"`,
        };
      },
    }),

    completeLinks: tool({
      description: "Mark multiple links as completed",
      inputSchema: zodSchema(linkIdsSchema),
      execute: async ({ ids }) => {
        const results = { completed: 0, errors: [] as string[] };
        for (const id of ids) {
          const link = store.query(linkById$(id));
          if (!link) {
            results.errors.push(`${id}: not found`);
            continue;
          }
          if (link.deletedAt || link.status === "completed") continue;
          store.commit(events.linkCompleted({ id, completedAt: new Date() }));
          results.completed++;
        }
        return { success: true, ...results };
      },
    }),

    // No execute = requires user confirmation
    deleteLinks: tool({
      description: "Move multiple links to trash (requires confirmation)",
      inputSchema: zodSchema(linkIdsSchema),
    }),

    getInboxLinks: tool({
      description: "List unread links in the inbox",
      inputSchema: zodSchema(getInboxSchema),
      execute: async ({ limit = 10 }) => {
        const links = store.query(inboxLinks$);
        return {
          links: links.slice(0, Math.min(limit, 20)).map((link) => ({
            id: link.id,
            url: link.url,
            title: link.title || link.domain,
            createdAt: link.createdAt,
          })),
          total: links.length,
        };
      },
    }),

    getStats: tool({
      description: "Get workspace link statistics",
      inputSchema: zodSchema(z.object({})),
      execute: async () => ({
        inbox: store.query(inboxCount$),
        completed: store.query(completedCount$),
        total: store.query(allLinksCount$),
      }),
    }),
  };
}

// Executors for tools that require confirmation (no execute function)
export function createToolExecutors(store: Store<typeof schema>) {
  return {
    deleteLink: async ({ id }: { id: string }): Promise<string> => {
      const link = store.query(linkById$(id));
      if (!link) return JSON.stringify({ error: "Link not found" });
      if (link.deletedAt) return JSON.stringify({ error: "Link already in trash" });

      store.commit(events.linkDeleted({ id, deletedAt: new Date() }));
      return JSON.stringify({
        success: true,
        message: `Moved "${link.title || link.url}" to trash`,
      });
    },

    deleteLinks: async ({ ids }: { ids: string[] }): Promise<string> => {
      const results = { deleted: 0, errors: [] as string[] };
      for (const id of ids) {
        const link = store.query(linkById$(id));
        if (!link) {
          results.errors.push(`${id}: not found`);
          continue;
        }
        if (link.deletedAt) continue;
        store.commit(events.linkDeleted({ id, deletedAt: new Date() }));
        results.deleted++;
      }
      return JSON.stringify({ success: true, ...results });
    },
  };
}
