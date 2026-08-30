import { tool, zodSchema } from "ai";
import { Effect, Match, Schema } from "effect";
import { z } from "zod";

import { normalizeLinkSearchQuery } from "../../lib/link-search";
import { WorkspaceLinksRemoteError } from "../workspace-links/effect-rpc";
import type { ChatLibrary } from "./library";

const MAX_TOOL_LINKS = 20;
const MAX_RETRIEVAL_TELEMETRY_CHARACTERS_PER_CALL = 100_000;

type RetrievalToolKind = "get" | "list" | "search";

export const ChatRetrievalTelemetry = Schema.Struct({
  getCalls: Schema.Number,
  listCalls: Schema.Number,
  searchCalls: Schema.Number,
  returnedItems: Schema.Number,
  serializedCharacters: Schema.Number,
  cappedCalls: Schema.Number,
});
export type ChatRetrievalTelemetry = Schema.Schema.Type<
  typeof ChatRetrievalTelemetry
>;

export interface ChatRetrievalTelemetryCollector {
  readonly record: (kind: RetrievalToolKind, result: unknown) => void;
  readonly snapshot: () => ChatRetrievalTelemetry;
}

const arrayLengthAt = (result: unknown, key: "links" | "results") => {
  if (typeof result !== "object" || result === null || !(key in result)) {
    return 0;
  }
  const value = (result as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.length : 0;
};

const returnedItemCount = (kind: RetrievalToolKind, result: unknown) =>
  Match.value(kind).pipe(
    Match.when("list", () => arrayLengthAt(result, "links")),
    Match.when("search", () => arrayLengthAt(result, "results")),
    Match.when("get", () =>
      typeof result === "object" && result !== null && "link" in result ? 1 : 0
    ),
    Match.exhaustive
  );

const serializedCharacters = (result: unknown) => {
  try {
    return JSON.stringify(result)?.length ?? 0;
  } catch {
    return MAX_RETRIEVAL_TELEMETRY_CHARACTERS_PER_CALL;
  }
};

export const createChatRetrievalTelemetry =
  (): ChatRetrievalTelemetryCollector => {
    let getCalls = 0;
    let listCalls = 0;
    let searchCalls = 0;
    let returnedItems = 0;
    let serializedCharacterCount = 0;
    let cappedCalls = 0;

    return {
      record: (kind, result) => {
        Match.value(kind).pipe(
          Match.when("get", () => {
            getCalls += 1;
          }),
          Match.when("list", () => {
            listCalls += 1;
          }),
          Match.when("search", () => {
            searchCalls += 1;
          }),
          Match.exhaustive
        );
        returnedItems += returnedItemCount(kind, result);
        const characters = serializedCharacters(result);
        serializedCharacterCount += Math.min(
          characters,
          MAX_RETRIEVAL_TELEMETRY_CHARACTERS_PER_CALL
        );
        if (characters >= MAX_RETRIEVAL_TELEMETRY_CHARACTERS_PER_CALL) {
          cappedCalls += 1;
        }
      },
      snapshot: () =>
        ChatRetrievalTelemetry.make({
          getCalls,
          listCalls,
          searchCalls,
          returnedItems,
          serializedCharacters: serializedCharacterCount,
          cappedCalls,
        }),
    };
  };

const listRecentLinksSchema = z.object({
  limit: z
    .number()
    .optional()
    .describe("Number of links to return (default 5)"),
  createdAfter: z.iso
    .datetime({ offset: true })
    .optional()
    .describe("Include links saved at or after this ISO 8601 timestamp"),
  createdBefore: z.iso
    .datetime({ offset: true })
    .optional()
    .describe("Include links saved before this ISO 8601 timestamp"),
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

const recoverToolError = <Value>(
  effect: Effect.Effect<Value, WorkspaceLinksRemoteError>
) =>
  effect.pipe(
    Effect.catchTag("WorkspaceLinksRemoteError", (error) =>
      Effect.succeed({ error: error.message })
    )
  );

const runTool = <Value>(
  effect: Effect.Effect<Value, WorkspaceLinksRemoteError>,
  runEffect: ToolEffectRunner
) => runEffect(recoverToolError(effect));

const runRetrievalTool = <Value>(
  effect: Effect.Effect<Value, WorkspaceLinksRemoteError>,
  runEffect: ToolEffectRunner,
  telemetry: ChatRetrievalTelemetryCollector | undefined,
  kind: RetrievalToolKind
) =>
  runEffect(
    recoverToolError(effect).pipe(
      Effect.tap((result) => Effect.sync(() => telemetry?.record(kind, result)))
    )
  );

const listRecentLinks = Effect.fn("ChatTools.listRecentLinks")(function* (
  library: ChatLibrary,
  input: z.infer<typeof listRecentLinksSchema>
) {
  const page = yield* library.list({
    state: "active",
    limit: limitTo(input.limit ?? 5, 5),
    sort: "newest",
    ...(input.createdAfter === undefined
      ? {}
      : { createdAfter: input.createdAfter }),
    ...(input.createdBefore === undefined
      ? {}
      : { createdBefore: input.createdBefore }),
  });
  return {
    links: page.links.map((link) => ({
      id: link.id,
      url: link.url,
      title: link.title || link.domain,
      description: link.description,
      createdAt: link.createdAt,
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
  if (link.state === "archive")
    return { error: "Cannot mark a deleted link as unread" };
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

export function createTools(
  library: ChatLibrary,
  runEffect: ToolEffectRunner,
  retrievalTelemetry?: ChatRetrievalTelemetryCollector
) {
  return {
    listRecentLinks: tool({
      description:
        "List saved links newest first. Use this for requests about the latest, " +
        "last, newest, recently saved, or links saved during a date range. Use " +
        "createdAfter and createdBefore for periods such as this week or last week, " +
        "and limit 1 for the single last link. Results include the saved timestamp; " +
        "do not call getLink unless the user needs fields missing from these results. " +
        "Present results with a plain URL and a brief description.",
      inputSchema: zodSchema(listRecentLinksSchema),
      execute: (input) =>
        runRetrievalTool(
          listRecentLinks(library, input),
          runEffect,
          retrievalTelemetry,
          "list"
        ),
    }),
    saveLink: tool({
      description:
        "Save an HTTP(S) URL to the library. Use this when the user supplies a URL " +
        "and asks to save, keep, or add it. Pass the URL unchanged.",
      inputSchema: zodSchema(saveLinkSchema),
      execute: ({ url }) => runTool(saveLink(library, url), runEffect),
    }),
    searchLinks: tool({
      description:
        "Search saved links by topic, title, site, description, summary, tag, or URL. " +
        "Use this when the user wants to find or recall something they saved. Pass " +
        "short meaningful keywords and present only relevant ranked results with plain URLs.",
      inputSchema: zodSchema(searchLinksSchema),
      execute: ({ query }) =>
        runRetrievalTool(
          searchLinks(library, query),
          runEffect,
          retrievalTelemetry,
          "search"
        ),
    }),
    getLink: tool({
      description:
        "Get the complete record for one saved link. Use an ID returned by another " +
        "tool when the user needs its URL, metadata, summary, tags, or current state.",
      inputSchema: zodSchema(linkIdSchema),
      execute: ({ id }) =>
        runRetrievalTool(
          getLink(library, id),
          runEffect,
          retrievalTelemetry,
          "get"
        ),
    }),
    completeLink: tool({
      description:
        "Mark one saved link as completed. Use an ID returned by another tool.",
      inputSchema: zodSchema(linkIdSchema),
      execute: ({ id }) => runTool(completeLink(library, id), runEffect),
    }),
    uncompleteLink: tool({
      description:
        "Move one completed link back to the unread inbox. Use an ID returned by another tool.",
      inputSchema: zodSchema(linkIdSchema),
      execute: ({ id }) => runTool(uncompleteLink(library, id), runEffect),
    }),
    deleteLink: tool({
      description:
        "Move one active link to Archive. This is reversible and the interface asks " +
        "the user to approve it before execution.",
      inputSchema: zodSchema(linkIdSchema),
      needsApproval: true,
      execute: ({ id }) => runTool(deleteLink(library, id), runEffect),
    }),
    restoreLink: tool({
      description: "Restore one archived link to the unread inbox.",
      inputSchema: zodSchema(linkIdSchema),
      execute: ({ id }) => runTool(restoreLink(library, id), runEffect),
    }),
    completeLinks: tool({
      description:
        "Mark several saved links as completed. Use IDs returned by another tool.",
      inputSchema: zodSchema(linkIdsSchema),
      execute: ({ ids }) => runTool(completeLinks(library, ids), runEffect),
    }),
    deleteLinks: tool({
      description:
        "Move several active links to Archive. This is reversible and the interface " +
        "asks the user to approve it before execution.",
      inputSchema: zodSchema(linkIdsSchema),
      needsApproval: true,
      execute: ({ ids }) => runTool(deleteLinks(library, ids), runEffect),
    }),
    getInboxLinks: tool({
      description:
        "List unread links currently in the inbox, newest first. Use this for requests " +
        "about unread, unfinished, or inbox links. Present each result with a plain URL.",
      inputSchema: zodSchema(getInboxSchema),
      execute: ({ limit = 10 }) =>
        runRetrievalTool(
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
          runEffect,
          retrievalTelemetry,
          "list"
        ),
    }),
    getStats: tool({
      description:
        "Get counts for the library: unread inbox links, completed links, and total active links.",
      inputSchema: zodSchema(z.object({})),
      execute: () => runTool(library.stats(), runEffect),
    }),
  };
}
