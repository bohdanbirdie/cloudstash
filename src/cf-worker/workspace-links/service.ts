import { nanoid } from "@livestore/livestore";
import type { Store } from "@livestore/livestore";
import { DateTime, Effect, Match, Option, Schema } from "effect";

import { HttpUrlFromString } from "@/lib/http-url";
import { MAX_LINK_SEARCH_RESULTS } from "@/lib/link-search";
import {
  DEFAULT_LINK_PAGE_SIZE,
  isoInstantToEpochMillis,
  MAX_LINK_BATCH_SIZE,
} from "@/lib/links-contract";
import type {
  LinkChanges,
  LinkCollectionState,
  LinkMutableState,
  ListLinksInput,
  SaveLinkInput,
  SearchLinksInput,
  UpdateLinkInput,
  UpdateLinksInput,
} from "@/lib/links-contract";
import { isValidTagName, sanitizeTagName } from "@/lib/tags";
import {
  apiLinkById$,
  apiLinksCount$,
  apiLinksFilteredCount$,
  apiLinksPage$,
  linkByUrl$,
  linkProcessingStatus$,
  linksByIds$,
  searchLinks$,
} from "@/livestore/queries/links";
import type { ApiLinkRow, SearchResult } from "@/livestore/queries/schemas";
import {
  allTagRows$,
  pendingSuggestionsForLink$,
  pendingTagsByLinkIds$,
  tagsByLinkIds$,
  tagsForLink$,
} from "@/livestore/queries/tags";
import { events } from "@/livestore/schema";
import type { schema, StoreEvent } from "@/livestore/schema";
import {
  captureSyncTarget,
  whenLeaderSynced,
} from "@/livestore/when-leader-synced";

import { LinkId } from "../db/branded";
import {
  decodeCursor,
  encodeLink,
  encodeLinksPage,
  mergeTagNamesByLink,
} from "../links/api";
import type { ApiLink, ApiSearchLink, Cursor } from "../links/api";
import {
  WorkspaceLinkInvalidInputError,
  WorkspaceLinkNotFoundError,
  WorkspaceLinkStoreError,
  WorkspaceLinkSyncError,
  WorkspaceLinkUnavailableError,
} from "./errors";

const SYNC_TIMEOUT_MS = 5_000;
const decodeUrl = Schema.decodeUnknownOption(HttpUrlFromString);

interface WorkspaceLinkFilter {
  readonly state: LinkCollectionState;
  readonly cursor: Cursor | null;
  readonly createdAfter?: number;
  readonly createdBefore?: number;
}

interface WorkspaceLinkPatch {
  readonly state?: LinkMutableState;
  readonly tags?: {
    readonly add?: readonly string[];
    readonly remove?: readonly string[];
    readonly set?: readonly string[];
  };
}

interface NormalizedTagPatch {
  readonly add: readonly string[];
  readonly remove: readonly string[];
  readonly replace: boolean;
}

type WorkspaceLinkBatchQuery =
  | {
      readonly ids: readonly LinkId[];
      readonly where?: never;
      readonly limit: number;
    }
  | {
      readonly ids?: never;
      readonly where: WorkspaceLinkFilter;
      readonly limit: number;
    };

export interface WorkspaceLinkSaveResult {
  readonly created: boolean;
  readonly link: ApiLink;
}

export interface WorkspaceLinkStats {
  readonly inbox: number;
  readonly completed: number;
  readonly total: number;
}

export interface WorkspaceLinkBatchUpdateResult {
  readonly links: readonly ApiLink[];
  readonly updated: number;
  readonly nextCursor: string | null;
}

const storeFailure = (operation: string) => (cause: unknown) =>
  new WorkspaceLinkStoreError({ operation, cause });

const invalid = (message: string) =>
  new WorkspaceLinkInvalidInputError({ message });

const timestamp = Effect.fnUntraced(function* (
  value: string | undefined,
  field: string
) {
  if (value === undefined) return undefined;
  const parsed = isoInstantToEpochMillis(value);
  if (parsed === null) {
    return yield* invalid(`${field} must be an ISO 8601 timestamp`);
  }
  return parsed;
});

const normalizeTags = Effect.fnUntraced(function* (
  values: readonly string[] | undefined
) {
  if (values === undefined) return undefined;
  const tags = [...new Set(values.map(sanitizeTagName))];
  const bad = tags.find((tag) => !isValidTagName(tag));
  if (bad !== undefined) {
    return yield* invalid(
      "Tags must contain 1–16 letters, numbers, or hyphens"
    );
  }
  return tags;
});

const dateRange = Effect.fnUntraced(function* (
  after: string | undefined,
  before: string | undefined,
  prefix = ""
) {
  const afterField = `${prefix}createdAfter`;
  const beforeField = `${prefix}createdBefore`;
  const createdAfter = yield* timestamp(after, afterField);
  const createdBefore = yield* timestamp(before, beforeField);
  if (
    createdAfter !== undefined &&
    createdBefore !== undefined &&
    createdAfter >= createdBefore
  ) {
    return yield* invalid(`${afterField} must be earlier than ${beforeField}`);
  }
  return { createdAfter, createdBefore };
});

const normalizeChanges = Effect.fnUntraced(function* (changes: LinkChanges) {
  if (changes.state === undefined && changes.tags === undefined) {
    return yield* invalid("At least one state or tag change is required");
  }
  if (
    changes.tags?.set !== undefined &&
    (changes.tags.add !== undefined || changes.tags.remove !== undefined)
  ) {
    return yield* invalid(
      "tags.set cannot be combined with tags.add or tags.remove"
    );
  }
  const tags = changes.tags
    ? {
        add: yield* normalizeTags(changes.tags.add),
        remove: yield* normalizeTags(changes.tags.remove),
        set: yield* normalizeTags(changes.tags.set),
      }
    : undefined;
  if (tags?.add?.some((tag) => tags.remove?.includes(tag) === true)) {
    return yield* invalid("The same tag cannot be added and removed");
  }
  if (
    tags !== undefined &&
    tags.set === undefined &&
    (tags.add?.length ?? 0) === 0 &&
    (tags.remove?.length ?? 0) === 0
  ) {
    return yield* invalid("At least one tag change is required");
  }
  return { state: changes.state, tags } satisfies WorkspaceLinkPatch;
});

const matchedFields = (
  result: SearchResult,
  tags: readonly string[],
  query: string
): string[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const fields: Array<readonly [string, string]> = [
    ["title", result.title ?? ""],
    ["tags", tags.join(" ")],
    ["domain", result.domain],
    ["description", result.description ?? ""],
    ["summary", result.summary ?? ""],
    ["url", result.url],
  ];
  return fields
    .filter(([, value]) => {
      const normalized = value.toLowerCase();
      return words.some((word) => normalized.includes(word));
    })
    .map(([field]) => field);
};

const normalizeTagPatch = (
  patch: NonNullable<WorkspaceLinkPatch["tags"]>
): NormalizedTagPatch => ({
  add: [...new Set((patch.set ?? patch.add ?? []).map(sanitizeTagName))],
  remove: [...new Set((patch.remove ?? []).map(sanitizeTagName))],
  replace: patch.set !== undefined,
});

type SyncChanges = (
  store: Store<typeof schema>,
  target: ReturnType<typeof captureSyncTarget>
) => Promise<boolean>;

export type CommitWorkspaceLinks = (
  operation: string,
  changes: readonly StoreEvent[]
) => Effect.Effect<
  void,
  WorkspaceLinkStoreError | WorkspaceLinkUnavailableError
>;

interface WorkspaceLinksOptions {
  readonly sync?: SyncChanges;
  readonly commit?: CommitWorkspaceLinks;
}

const syncChanges: SyncChanges = (store, target) =>
  whenLeaderSynced(store, { target, timeoutMs: SYNC_TIMEOUT_MS });

export const makeWorkspaceLinks = (
  store: Store<typeof schema>,
  options: WorkspaceLinksOptions = {}
) => {
  const sync = options.sync ?? syncChanges;
  const query = Effect.fnUntraced(function* <Value>(
    operation: string,
    run: () => Value
  ) {
    return yield* Effect.try({ try: run, catch: storeFailure(operation) });
  });

  const tagNamesByLink = Effect.fnUntraced(function* (
    linkIds: readonly string[]
  ) {
    return yield* query("queryTags", () =>
      mergeTagNamesByLink(
        store.query(tagsByLinkIds$(linkIds)),
        store.query(pendingTagsByLinkIds$(linkIds))
      )
    );
  });

  const commit = Effect.fnUntraced(function* (
    operation: string,
    changes: readonly StoreEvent[]
  ) {
    if (changes.length === 0) return;
    const persist =
      options.commit ??
      ((name: string, eventsToCommit: readonly StoreEvent[]) =>
        query(name, () => store.commit(...eventsToCommit)));
    yield* persist(operation, changes);
    yield* awaitSync(operation);
  });

  const awaitSync = Effect.fnUntraced(function* (operation: string) {
    const target = yield* query(operation, () => captureSyncTarget(store));
    const synced = yield* Effect.tryPromise({
      try: () => sync(store, target),
      catch: storeFailure(`${operation}.sync`),
    });
    if (!synced) return yield* new WorkspaceLinkSyncError({ operation });
  });

  const get = Effect.fnUntraced(function* (linkId: LinkId) {
    const row = yield* query("getLink", () =>
      store.query(apiLinkById$(linkId))
    );
    if (row === null) return null;
    const tags = yield* tagNamesByLink([linkId]);
    return encodeLink(row, tags.get(linkId) ?? []);
  });

  const ensureTags = Effect.fnUntraced(function* (
    requested: readonly string[],
    now: Date
  ) {
    const tags = yield* query("queryTags", () => store.query(allTagRows$));
    const active = new Map(
      tags.filter((tag) => tag.deletedAt === null).map((tag) => [tag.id, tag])
    );
    let sortOrder = Math.max(0, ...tags.map((tag) => tag.sortOrder));
    const ids = [...new Set(requested.map(sanitizeTagName))];
    const deleted = tags.find(
      (tag) => tag.deletedAt !== null && ids.includes(tag.id)
    );
    if (deleted) {
      return yield* new WorkspaceLinkInvalidInputError({
        message: `Tag "${deleted.id}" has been deleted`,
      });
    }
    const created: StoreEvent[] = [];
    for (const id of ids) {
      if (active.has(id)) continue;
      sortOrder += 1;
      created.push(
        events.tagCreated({
          id,
          name: id,
          sortOrder,
          createdAt: now,
        })
      );
    }
    return { ids, events: created };
  });

  const tagChanges = Effect.fnUntraced(function* (
    linkId: LinkId,
    patch: NormalizedTagPatch,
    now: Date
  ) {
    const current = yield* query("queryLinkTags", () =>
      store.query(tagsForLink$(linkId))
    );
    const pending = yield* query("queryTagSuggestions", () =>
      store.query(pendingSuggestionsForLink$(linkId))
    );
    const currentIds = new Set(current.map((tag) => tag.id));
    const add = new Set(patch.add);
    const remove = new Set(patch.remove);
    if (patch.replace) {
      for (const id of currentIds) if (!add.has(id)) remove.add(id);
    }

    const changes: StoreEvent[] = [];
    for (const tagId of add) {
      if (!currentIds.has(tagId)) {
        changes.push(
          events.linkTagged({
            createdAt: now,
            id: `${linkId}-${tagId}`,
            linkId,
            tagId,
          })
        );
      }
    }
    for (const tagId of remove) {
      if (currentIds.has(tagId)) {
        changes.push(events.linkUntaggedV2({ linkId, tagId }));
      }
    }

    for (const suggestion of pending) {
      const id = sanitizeTagName(suggestion.tagId ?? suggestion.suggestedName);
      if (add.has(id)) {
        changes.push(events.tagSuggestionAccepted({ id: suggestion.id }));
      } else if (remove.has(id) || (patch.replace && !add.has(id))) {
        changes.push(events.tagSuggestionDismissed({ id: suggestion.id }));
      }
    }
    return changes;
  });

  const updateEvents = Effect.fnUntraced(function* (
    link: {
      readonly id: string;
      readonly status: string;
      readonly deletedAt: number | null;
    },
    patch: WorkspaceLinkPatch,
    now: Date,
    tags: NormalizedTagPatch | undefined
  ) {
    const linkId = LinkId.make(link.id);
    const changes = Match.value(patch.state).pipe(
      Match.when(undefined, (): StoreEvent[] => []),
      Match.when("inbox", (): StoreEvent[] => [
        ...(link.deletedAt === null
          ? []
          : [events.linkRestored({ id: linkId })]),
        ...(link.status === "unread"
          ? []
          : [events.linkUncompleted({ id: linkId })]),
      ]),
      Match.when("completed", (): StoreEvent[] => [
        ...(link.deletedAt === null
          ? []
          : [events.linkRestored({ id: linkId })]),
        ...(link.status === "completed"
          ? []
          : [events.linkCompleted({ id: linkId, completedAt: now })]),
      ]),
      Match.when("archive", (): StoreEvent[] =>
        link.deletedAt === null
          ? [events.linkDeleted({ id: linkId, deletedAt: now })]
          : []
      ),
      Match.exhaustive
    );
    if (tags) changes.push(...(yield* tagChanges(linkId, tags, now)));
    return changes;
  });

  const updateByIds = Effect.fnUntraced(function* (
    ids: readonly LinkId[],
    patch: WorkspaceLinkPatch,
    prefetched?: readonly ApiLinkRow[]
  ) {
    const links =
      prefetched ??
      (yield* query("findLinksForUpdate", () =>
        store.query(linksByIds$([...ids]))
      ));
    if (links.length === 0) return [];
    const now = yield* DateTime.nowAsDate;
    const tagPatch = patch.tags ? normalizeTagPatch(patch.tags) : undefined;
    const ensured = tagPatch
      ? yield* ensureTags(tagPatch.add, now)
      : { events: [] as StoreEvent[] };
    const changes = yield* Effect.forEach(links, (link) =>
      updateEvents(link, patch, now, tagPatch)
    ).pipe(Effect.map((groups) => [...ensured.events, ...groups.flat()]));
    yield* commit("updateLinks", changes);
    const updated = yield* query("readUpdatedLinks", () =>
      store.query(linksByIds$(links.map((link) => link.id)))
    );
    const tags = yield* tagNamesByLink(updated.map((link) => link.id));
    return updated.map((link) => encodeLink(link, tags.get(link.id) ?? []));
  });

  const selectBatch = Effect.fnUntraced(function* (
    input: WorkspaceLinkBatchQuery
  ) {
    if (input.ids !== undefined) {
      const ids = input.ids;
      const rows = yield* query("selectLinksById", () =>
        store.query(linksByIds$([...ids]))
      );
      const found = new Set(rows.map((row) => row.id));
      return {
        ids: ids.filter((id) => found.has(id)),
        missingId: ids.find((id) => !found.has(id)),
        nextCursor: null,
        rows,
      };
    }
    const where = input.where;
    const rows = yield* query("selectLinksForUpdate", () =>
      store.query(
        apiLinksPage$({
          state: where.state,
          limitPlusOne: input.limit + 1,
          cursor: where.cursor,
          sort: "newest",
          createdAfter: where.createdAfter,
          createdBefore: where.createdBefore,
        })
      )
    );
    const page = encodeLinksPage(rows, new Map(), rows.length, input.limit);
    return {
      ids: page.links.map((link) => LinkId.make(link.id)),
      missingId: undefined,
      nextCursor: page.nextCursor,
      // apiLinksPage$ returns the API page shape, not the row shape
      // updateEvents needs, so this branch still pays its own read.
      rows: undefined,
    };
  });

  const requireLink = Effect.fnUntraced(function* (id: string) {
    const linkId = LinkId.make(id);
    const link = yield* get(linkId);
    if (link === null) return yield* new WorkspaceLinkNotFoundError({ linkId });
    return link;
  });

  return {
    list: Effect.fn("WorkspaceLinks.list")(function* (input: ListLinksInput) {
      const cursor =
        input.cursor === undefined ? null : decodeCursor(input.cursor);
      if (input.cursor !== undefined && cursor === null) {
        return yield* invalid("Invalid cursor");
      }
      const { createdAfter, createdBefore } = yield* dateRange(
        input.createdAfter,
        input.createdBefore
      );
      const state = input.state ?? "active";
      const limit = input.limit ?? DEFAULT_LINK_PAGE_SIZE;
      const rows = yield* query("listLinks", () =>
        store.query(
          apiLinksPage$({
            state,
            limitPlusOne: limit + 1,
            cursor,
            sort: input.sort ?? "newest",
            createdAfter,
            createdBefore,
          })
        )
      );
      const tags = yield* tagNamesByLink(rows.map((row) => row.id));
      const hasDateFilter =
        createdAfter !== undefined || createdBefore !== undefined;
      const total = yield* query("countLinks", () =>
        store.query(
          hasDateFilter
            ? apiLinksFilteredCount$({ state, createdAfter, createdBefore })
            : apiLinksCount$(state)
        )
      );
      return encodeLinksPage(rows, tags, total, limit);
    }),

    search: Effect.fn("WorkspaceLinks.search")(function* (
      input: SearchLinksInput
    ) {
      const { createdAfter, createdBefore } = yield* dateRange(
        input.createdAfter,
        input.createdBefore
      );
      const rows = yield* query("searchLinks", () =>
        store.query(
          searchLinks$(input.query, {
            state: input.state ?? "active",
            match: input.match ?? "any",
            limit: input.limit ?? MAX_LINK_SEARCH_RESULTS,
            createdAfter,
            createdBefore,
          })
        )
      );
      const tags = yield* tagNamesByLink(rows.map((row) => row.id));
      return rows.map((row): ApiSearchLink => {
        const linkTags = tags.get(row.id) ?? [];
        return {
          ...encodeLink(row, linkTags),
          score: row.score,
          matchedFields: matchedFields(row, linkTags, input.query),
        };
      });
    }),

    get: Effect.fn("WorkspaceLinks.get")(function* (id: string) {
      return yield* requireLink(id);
    }),

    save: Effect.fn("WorkspaceLinks.save")(function* (
      input: SaveLinkInput & { readonly source: "api" | "chat" | "mcp" }
    ) {
      const decoded = decodeUrl(input.url);
      const url = yield* Option.match(decoded, {
        onNone: () => Effect.fail(invalid("url must be an HTTP(S) URL")),
        onSome: Effect.succeed,
      });
      const tags = (yield* normalizeTags(input.tags)) ?? [];
      const now = yield* DateTime.nowAsDate;
      const tagPatch =
        tags.length > 0 ? normalizeTagPatch({ add: tags }) : undefined;
      if (tagPatch) {
        // Validate before creating a durable link; resolve the actual tag
        // creation events again after URL-winner reconciliation.
        yield* ensureTags(tagPatch.add, now);
      }
      const existing = yield* query("findLinkByUrl", () =>
        store.query(linkByUrl$(url.href))
      );
      const proposedLinkId = existing
        ? LinkId.make(existing.id)
        : LinkId.make(nanoid());
      if (!existing) {
        yield* commit("saveLink", [
          events.linkCreatedV2({
            id: proposedLinkId,
            url: url.href,
            domain: url.hostname.replace(/^www\./, ""),
            createdAt: now,
            source: input.source,
            sourceMeta: null,
          }),
        ]);
      } else {
        yield* awaitSync("saveLink.resolve");
      }

      const canonical = yield* query("resolveSavedLink", () =>
        store.query(linkByUrl$(url.href))
      );
      if (canonical === null) {
        return yield* new WorkspaceLinkStoreError({
          operation: "resolveSavedLink",
          cause: new Error("Saved link has no canonical URL winner"),
        });
      }
      const linkId = LinkId.make(canonical.id);
      const changes: StoreEvent[] = [];
      if (tagPatch) {
        const ensured = yield* ensureTags(tagPatch.add, now);
        changes.push(
          ...ensured.events,
          ...(yield* tagChanges(linkId, tagPatch, now))
        );
      }
      const status = yield* query("readSavedLinkProcessingStatus", () =>
        store.query(linkProcessingStatus$(linkId))
      );
      if (status === null || status === undefined) {
        changes.push(events.linkProcessingStarted({ linkId, updatedAt: now }));
      }
      yield* commit("saveLink.finalize", changes);
      const link = yield* get(linkId);
      if (link === null) {
        return yield* new WorkspaceLinkStoreError({
          operation: "readSavedLink",
          cause: new Error("Saved link was not materialized"),
        });
      }
      return {
        created: existing === null && linkId === proposedLinkId,
        link,
      } satisfies WorkspaceLinkSaveResult;
    }),

    update: Effect.fn("WorkspaceLinks.update")(function* (
      input: UpdateLinkInput
    ) {
      const patch = yield* normalizeChanges(input.changes);
      const linkId = LinkId.make(input.id);
      const updated = yield* updateByIds([linkId], patch);
      if (updated.length === 0) {
        return yield* new WorkspaceLinkNotFoundError({ linkId });
      }
      return updated[0];
    }),

    updateMany: Effect.fn("WorkspaceLinks.updateMany")(function* (
      input: UpdateLinksInput
    ) {
      if ((input.ids === undefined) === (input.where === undefined)) {
        return yield* invalid("Provide exactly one of ids or where");
      }
      const patch = yield* normalizeChanges(input.changes);
      const limit = input.limit ?? MAX_LINK_BATCH_SIZE;
      const { createdAfter, createdBefore } = yield* dateRange(
        input.where?.createdAfter,
        input.where?.createdBefore,
        "where."
      );
      const cursor = input.where?.cursor
        ? decodeCursor(input.where.cursor)
        : null;
      if (input.where?.cursor !== undefined && cursor === null) {
        return yield* invalid("Invalid where.cursor");
      }
      const ids = input.ids?.map((id) => LinkId.make(id));
      const selected = yield* selectBatch(
        ids === undefined
          ? {
              where: {
                state: input.where?.state ?? "active",
                cursor,
                createdAfter,
                createdBefore,
              },
              limit,
            }
          : { ids, limit }
      );
      if (selected.missingId) {
        return yield* new WorkspaceLinkNotFoundError({
          linkId: selected.missingId,
        });
      }
      const links = yield* updateByIds(selected.ids, patch, selected.rows);
      return {
        links,
        updated: links.length,
        nextCursor: selected.nextCursor,
      } satisfies WorkspaceLinkBatchUpdateResult;
    }),

    stats: Effect.fn("WorkspaceLinks.stats")(function* () {
      const [inbox, completed, total] = yield* Effect.all([
        query("countInboxLinks", () => store.query(apiLinksCount$("inbox"))),
        query("countCompletedLinks", () =>
          store.query(apiLinksCount$("completed"))
        ),
        query("countActiveLinks", () => store.query(apiLinksCount$("active"))),
      ]);
      return { inbox, completed, total } satisfies WorkspaceLinkStats;
    }),
  };
};

export type WorkspaceLinks = ReturnType<typeof makeWorkspaceLinks>;
