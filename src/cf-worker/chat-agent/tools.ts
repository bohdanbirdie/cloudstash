import { tool, zodSchema } from "ai";
import { Effect } from "effect";
import { z } from "zod";

import { normalizeLinkSearchQuery } from "../../lib/link-search";
import { WorkspaceLinksRemoteError } from "../workspace-links/effect-rpc";
import type { ChatLibrary } from "./library";

const MAX_TOOL_LINKS = 20;

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
const linkIdSchema = z.object({ id: z.string().describe("Link ID") });
const linkIdsSchema = z.object({
  ids: z.array(z.string()).describe("Array of link IDs"),
});
const getInboxSchema = z.object({
  limit: z.number().optional().describe("Max links to return (default 10)"),
});

const limitTo = (value: number, fallback: number) =>
  Math.min(value || fallback, MAX_TOOL_LINKS);
type ChatLink = Effect.Success<ReturnType<ChatLibrary["get"]>>;
const titleOf = (link: ChatLink) => link.title || link.url;

export interface ToolEffectRunner {
  <Value, Error>(effect: Effect.Effect<Value, Error>): Promise<Value>;
}

const runTool = <Value>(
  effect: Effect.Effect<Value, WorkspaceLinksRemoteError>,
  runEffect: ToolEffectRunner
) =>
  runEffect(
    effect.pipe(
      Effect.catchTag("WorkspaceLinksRemoteError", (error) =>
        Effect.succeed({ error: error.message })
      )
    )
  );

const listRecentLinks = Effect.fn("ChatTools.listRecentLinks")(function* (
  library: ChatLibrary,
  limit: number
) {
  const page = yield* library.list({
    state: "active",
    limit: limitTo(limit, 5),
    sort: "newest",
  });
  return {
    links: page.links.map((link) => ({
      id: link.id,
      url: link.url,
      title: link.title || link.domain,
      description: link.description,
    })),
  };
});

const saveLink = Effect.fn("ChatTools.saveLink")(function* (
  library: ChatLibrary,
  url: string
) {
  const saved = yield* library
    .save({ url, source: "chat" })
    .pipe(
      Effect.catchTag("WorkspaceLinksRemoteError", (error) =>
        error.code === "invalid_input"
          ? Effect.succeed(null)
          : Effect.fail(error)
      )
    );
  if (saved === null) return { success: false, error: "Invalid URL" };
  if (!saved.created) {
    return {
      success: false,
      error: "Link already exists",
      existingLinkId: saved.link.id,
    };
  }
  return {
    success: true,
    linkId: saved.link.id,
    message: `Saved "${url}" to the library`,
  };
});

const searchLinks = Effect.fn("ChatTools.searchLinks")(function* (
  library: ChatLibrary,
  rawQuery: string
) {
  const query = normalizeLinkSearchQuery(rawQuery);
  if (query === null) return { query: rawQuery, total: 0, results: [] };
  const results = yield* library.search({
    query,
    state: "active",
    limit: MAX_TOOL_LINKS,
  });
  return {
    query: rawQuery,
    total: results.length,
    results: results.map((link) => ({
      id: link.id,
      url: link.url,
      title: link.title || link.domain,
      description: link.description,
      summary: link.summary,
      score: link.score,
    })),
  };
});

const getLink = Effect.fn("ChatTools.getLink")(function* (
  library: ChatLibrary,
  id: string
) {
  const link = yield* findLink(library, id);
  return link === null ? { error: "Link not found" } : { link };
});

const findLink = Effect.fnUntraced(function* (
  library: ChatLibrary,
  id: string
) {
  return yield* library
    .get({ id })
    .pipe(
      Effect.catchTag("WorkspaceLinksRemoteError", (error) =>
        error.code === "not_found" ? Effect.succeed(null) : Effect.fail(error)
      )
    );
});

const completeLink = Effect.fn("ChatTools.completeLink")(function* (
  library: ChatLibrary,
  id: string
) {
  const link = yield* findLink(library, id);
  if (link === null) return { error: "Link not found" };
  if (link.state === "archive")
    return { error: "Cannot complete a deleted link" };
  if (link.state === "completed") return { error: "Link already completed" };
  yield* library.update({ id, changes: { state: "completed" } });
  return { success: true, message: `Marked "${titleOf(link)}" as done` };
});

const uncompleteLink = Effect.fn("ChatTools.uncompleteLink")(function* (
  library: ChatLibrary,
  id: string
) {
  const link = yield* findLink(library, id);
  if (link === null) return { error: "Link not found" };
  if (link.state === "inbox") return { error: "Link is already unread" };
  yield* library.update({ id, changes: { state: "inbox" } });
  return { success: true, message: `Marked "${titleOf(link)}" as unread` };
});

const restoreLink = Effect.fn("ChatTools.restoreLink")(function* (
  library: ChatLibrary,
  id: string
) {
  const link = yield* findLink(library, id);
  if (link === null) return { error: "Link not found" };
  if (link.state !== "archive") return { error: "Link is not in archive" };
  yield* library.update({ id, changes: { state: "inbox" } });
  return { success: true, message: `Restored "${titleOf(link)}"` };
});

const resolveBatch = Effect.fnUntraced(function* (
  library: ChatLibrary,
  ids: readonly string[],
  shouldUpdate: (link: ChatLink) => boolean
) {
  const resolved = yield* Effect.forEach(
    ids,
    (id) => findLink(library, id).pipe(Effect.map((link) => ({ id, link }))),
    { concurrency: 1 }
  );
  return {
    ids: resolved
      .filter(
        (entry): entry is { id: string; link: ChatLink } => entry.link !== null
      )
      .filter(({ link }) => shouldUpdate(link))
      .map(({ id }) => id),
    errors: resolved
      .filter(({ link }) => link === null)
      .map(({ id }) => `${id}: not found`),
  };
});

const completeLinks = Effect.fn("ChatTools.completeLinks")(function* (
  library: ChatLibrary,
  ids: readonly string[]
) {
  const batch = yield* resolveBatch(
    library,
    ids,
    (link) => link.state === "inbox"
  );
  if (batch.ids.length > 0) {
    yield* library.updateMany({
      ids: batch.ids,
      changes: { state: "completed" },
    });
  }
  return { success: true, completed: batch.ids.length, errors: batch.errors };
});

const deleteLink = Effect.fn("ChatTools.deleteLink")(function* (
  library: ChatLibrary,
  id: string
) {
  const link = yield* findLink(library, id);
  if (link === null) return { error: "Link not found" };
  if (link.state === "archive") return { error: "Link already in archive" };
  yield* library.update({ id, changes: { state: "archive" } });
  return { success: true, message: `Moved "${titleOf(link)}" to archive` };
});

const deleteLinks = Effect.fn("ChatTools.deleteLinks")(function* (
  library: ChatLibrary,
  ids: readonly string[]
) {
  const batch = yield* resolveBatch(
    library,
    ids,
    (link) => link.state !== "archive"
  );
  if (batch.ids.length > 0) {
    yield* library.updateMany({
      ids: batch.ids,
      changes: { state: "archive" },
    });
  }
  return { success: true, deleted: batch.ids.length, errors: batch.errors };
});

export function createTools(library: ChatLibrary, runEffect: ToolEffectRunner) {
  return {
    listRecentLinks: tool({
      description:
        "List recently saved links in the library. Present results as a markdown " +
        "list with plain URLs (not [text](url) format) followed by a brief description. " +
        "Example: '- https://example.com - description'",
      inputSchema: zodSchema(listRecentLinksSchema),
      execute: ({ limit = 5 }) =>
        runTool(listRecentLinks(library, limit), runEffect),
    }),
    saveLink: tool({
      description: "Save a new link to the library",
      inputSchema: zodSchema(saveLinkSchema),
      execute: ({ url }) => runTool(saveLink(library, url), runEffect),
    }),
    searchLinks: tool({
      description:
        "Search for links by keywords. Returns keyword matches - filter results to only " +
        "include links that conceptually match what the user is looking for. Present " +
        "relevant results as a markdown list with plain URLs (not [text](url) format) " +
        "followed by a brief description. Example: '- https://example.com - description'",
      inputSchema: zodSchema(searchLinksSchema),
      execute: ({ query }) => runTool(searchLinks(library, query), runEffect),
    }),
    getLink: tool({
      description: "Get details of a specific link by ID",
      inputSchema: zodSchema(linkIdSchema),
      execute: ({ id }) => runTool(getLink(library, id), runEffect),
    }),
    completeLink: tool({
      description: "Mark a link as completed/done",
      inputSchema: zodSchema(linkIdSchema),
      execute: ({ id }) => runTool(completeLink(library, id), runEffect),
    }),
    uncompleteLink: tool({
      description: "Mark a completed link back as unread",
      inputSchema: zodSchema(linkIdSchema),
      execute: ({ id }) => runTool(uncompleteLink(library, id), runEffect),
    }),
    deleteLink: tool({
      description: "Move a link to archive (requires confirmation)",
      inputSchema: zodSchema(linkIdSchema),
      needsApproval: true,
      execute: ({ id }) => runTool(deleteLink(library, id), runEffect),
    }),
    restoreLink: tool({
      description: "Restore a link from archive",
      inputSchema: zodSchema(linkIdSchema),
      execute: ({ id }) => runTool(restoreLink(library, id), runEffect),
    }),
    completeLinks: tool({
      description: "Mark multiple links as completed",
      inputSchema: zodSchema(linkIdsSchema),
      execute: ({ ids }) => runTool(completeLinks(library, ids), runEffect),
    }),
    deleteLinks: tool({
      description: "Move multiple links to archive (requires confirmation)",
      inputSchema: zodSchema(linkIdsSchema),
      needsApproval: true,
      execute: ({ ids }) => runTool(deleteLinks(library, ids), runEffect),
    }),
    getInboxLinks: tool({
      description:
        "List unread links in the inbox. Present results as a markdown list with " +
        "plain URLs (not [text](url) format) followed by a brief description. " +
        "Example: '- https://example.com - description'",
      inputSchema: zodSchema(getInboxSchema),
      execute: ({ limit = 10 }) =>
        runTool(
          library
            .list({ state: "inbox", limit: limitTo(limit, 10), sort: "newest" })
            .pipe(
              Effect.map((page) => ({
                links: page.links.map((link) => ({
                  id: link.id,
                  url: link.url,
                  title: link.title || link.domain,
                  createdAt: link.createdAt,
                })),
                total: page.total,
              }))
            ),
          runEffect
        ),
    }),
    getStats: tool({
      description: "Get library statistics",
      inputSchema: zodSchema(z.object({})),
      execute: () => runTool(library.stats(), runEffect),
    }),
  };
}
