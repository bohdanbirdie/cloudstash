import { nanoid, type Store } from "@livestore/livestore";
import { tool, zodSchema } from "ai";
import { z } from "zod";

import { allLinks$, searchLinks$ } from "../../livestore/queries";
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

        // Check duplicate
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
  };
}
