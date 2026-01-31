import { tool, zodSchema } from "ai";
import { z } from "zod";

const listRecentLinksSchema = z.object({
  limit: z
    .number()
    .optional()
    .describe("Number of links to return (default 5)"),
});

const saveLinkSchema = z.object({
  url: z.string().describe("The URL to save"),
  title: z.string().optional().describe("Optional title for the link"),
});

const searchLinksSchema = z.object({
  query: z.string().describe("Search query"),
});

export function createTools() {
  return {
    listRecentLinks: tool({
      description: "List recently saved links in the workspace",
      inputSchema: zodSchema(listRecentLinksSchema),
      execute: async ({ limit = 5 }) => ({
        links: [
          { id: "1", title: "Example Link 1", url: "https://example.com/1" },
          { id: "2", title: "Example Link 2", url: "https://example.com/2" },
        ].slice(0, limit),
      }),
    }),

    saveLink: tool({
      description: "Save a new link to the workspace",
      inputSchema: zodSchema(saveLinkSchema),
      execute: async ({ url, title }) => ({
        success: true,
        linkId: "dummy-" + Date.now(),
        message: `Saved "${title || url}" to workspace`,
      }),
    }),

    searchLinks: tool({
      description: "Search for links by keyword",
      inputSchema: zodSchema(searchLinksSchema),
      execute: async ({ query }) => ({
        results: [
          {
            id: "1",
            title: `Result for "${query}"`,
            url: "https://example.com",
            score: 0.9,
          },
        ],
      }),
    }),
  };
}
