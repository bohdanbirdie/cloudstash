import { nanoid } from "@livestore/livestore";
import type { Store } from "@livestore/livestore";
import { Context, DateTime, Effect, Layer, Match } from "effect";

import type {
  LinkCollectionState,
  LinkListSort,
  LinkMutableState,
  LinkSearchMatch,
} from "@/lib/links-contract";
import { sanitizeTagName } from "@/lib/tags";
import {
  apiLinkById$,
  apiLinksCount$,
  apiLinksFilteredCount$,
  apiLinksPage$,
  linkByUrl$,
  linksByIds$,
  searchLinks$,
} from "@/livestore/queries/links";
import type { SearchResult } from "@/livestore/queries/schemas";
import {
  allTagRows$,
  pendingSuggestionsForLink$,
  pendingTagsByLinkIds$,
  tagsByLinkIds$,
  tagsForLink$,
} from "@/livestore/queries/tags";
import { events } from "@/livestore/schema";
import type { schema } from "@/livestore/schema";
import {
  captureSyncTarget,
  whenLeaderSynced,
} from "@/livestore/when-leader-synced";

import { LinkId } from "../db/branded";
import type { StoreEvent } from "../link-processor/services";
import { encodeLink, encodeLinksPage, mergeTagNamesByLink } from "../links/api";
import type { ApiLink, ApiSearchLink, Cursor } from "../links/api";
import {
  WorkspaceLinkInvalidInputError,
  WorkspaceLinkStoreError,
  WorkspaceLinkSyncError,
  WorkspaceLinkUnavailableError,
} from "./errors";

const SYNC_TIMEOUT_MS = 5_000;

export interface WorkspaceLinkListQuery {
  readonly state: LinkCollectionState;
  readonly limit: number;
  readonly cursor: Cursor | null;
  readonly sort: LinkListSort;
  readonly createdAfter?: number;
  readonly createdBefore?: number;
}

export interface WorkspaceLinkSearchQuery {
  readonly query: string;
  readonly match: LinkSearchMatch;
  readonly state: LinkCollectionState;
  readonly limit: number;
  readonly createdAfter?: number;
  readonly createdBefore?: number;
}

export interface WorkspaceLinkPatch {
  readonly state?: LinkMutableState;
  readonly tags?: {
    readonly add?: readonly string[];
    readonly remove?: readonly string[];
    readonly set?: readonly string[];
  };
}

export type WorkspaceLinkBatchQuery =
  | {
      readonly ids: readonly LinkId[];
      readonly where?: never;
      readonly limit: number;
    }
  | {
      readonly ids?: never;
      readonly where: Omit<WorkspaceLinkListQuery, "sort">;
      readonly limit: number;
    };

interface WorkspaceLinkSaveResult {
  readonly created: boolean;
  readonly link: ApiLink;
}

const storeFailure = (operation: string) => (cause: unknown) =>
  new WorkspaceLinkStoreError({ operation, cause });

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

type SyncChanges = (
  store: Store<typeof schema>,
  target: ReturnType<typeof captureSyncTarget>
) => Promise<boolean>;

type CanCommit = () => boolean;

const syncChanges: SyncChanges = (store, target) =>
  whenLeaderSynced(store, { target, timeoutMs: SYNC_TIMEOUT_MS });

const make = (
  store: Store<typeof schema>,
  sync: SyncChanges,
  canCommit: CanCommit
) => {
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
    if (!canCommit()) return yield* new WorkspaceLinkUnavailableError();
    yield* query(operation, () => store.commit(...changes));
    const target = yield* query(operation, () => captureSyncTarget(store));
    const synced = yield* Effect.tryPromise({
      try: () => sync(store, target),
      catch: storeFailure(`${operation}.sync`),
    });
    if (!synced) return yield* new WorkspaceLinkSyncError({ operation });
  });

  const get = Effect.fn("WorkspaceLinkRepository.get")(function* (
    linkId: LinkId
  ) {
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
    patch: NonNullable<WorkspaceLinkPatch["tags"]>,
    now: Date
  ) {
    const current = yield* query("queryLinkTags", () =>
      store.query(tagsForLink$(linkId))
    );
    const pending = yield* query("queryTagSuggestions", () =>
      store.query(pendingSuggestionsForLink$(linkId))
    );
    const currentIds = new Set(current.map((tag) => tag.id));
    const requestedSet = patch.set?.map(sanitizeTagName);
    const add = new Set(requestedSet ?? patch.add?.map(sanitizeTagName) ?? []);
    const remove = new Set(patch.remove?.map(sanitizeTagName) ?? []);
    if (requestedSet) {
      for (const id of currentIds) if (!add.has(id)) remove.add(id);
    }

    const ensured = yield* ensureTags([...add], now);
    const changes: StoreEvent[] = [...ensured.events];
    for (const tagId of ensured.ids) {
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
      } else if (remove.has(id) || (requestedSet && !add.has(id))) {
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
    now: Date
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
    if (patch.tags)
      changes.push(...(yield* tagChanges(linkId, patch.tags, now)));
    return changes;
  });

  return {
    list: Effect.fn("WorkspaceLinkRepository.list")(function* (
      input: WorkspaceLinkListQuery
    ) {
      const rows = yield* query("listLinks", () =>
        store.query(
          apiLinksPage$({
            state: input.state,
            limitPlusOne: input.limit + 1,
            cursor: input.cursor,
            sort: input.sort,
            createdAfter: input.createdAfter,
            createdBefore: input.createdBefore,
          })
        )
      );
      const tags = yield* tagNamesByLink(rows.map((row) => row.id));
      const hasDateFilter =
        input.createdAfter !== undefined || input.createdBefore !== undefined;
      const total = yield* query("countLinks", () =>
        store.query(
          hasDateFilter
            ? apiLinksFilteredCount$({
                state: input.state,
                createdAfter: input.createdAfter,
                createdBefore: input.createdBefore,
              })
            : apiLinksCount$(input.state)
        )
      );
      return encodeLinksPage(rows, tags, total, input.limit);
    }),

    search: Effect.fn("WorkspaceLinkRepository.search")(function* (
      input: WorkspaceLinkSearchQuery
    ) {
      const rows = yield* query("searchLinks", () =>
        store.query(
          searchLinks$(input.query, {
            state: input.state,
            match: input.match,
            limit: input.limit,
            createdAfter: input.createdAfter,
            createdBefore: input.createdBefore,
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

    get,

    save: Effect.fn("WorkspaceLinkRepository.save")(function* (input: {
      readonly url: URL;
      readonly tags: readonly string[];
      readonly source: "api" | "mcp";
    }) {
      const now = yield* DateTime.nowAsDate;
      const existing = yield* query("findLinkByUrl", () =>
        store.query(linkByUrl$(input.url.href))
      );
      const linkId = existing
        ? LinkId.make(existing.id)
        : LinkId.make(nanoid());
      const changes: StoreEvent[] = [];
      if (!existing) {
        changes.push(
          events.linkCreatedV2({
            id: linkId,
            url: input.url.href,
            domain: input.url.hostname.replace(/^www\./, ""),
            createdAt: now,
            source: input.source,
            sourceMeta: null,
          })
        );
      }
      if (input.tags.length > 0) {
        changes.push(...(yield* tagChanges(linkId, { add: input.tags }, now)));
      }
      yield* commit("saveLink", changes);
      const link = yield* get(linkId);
      if (link === null) {
        return yield* new WorkspaceLinkStoreError({
          operation: "readSavedLink",
          cause: new Error("Saved link was not materialized"),
        });
      }
      return {
        created: existing === null,
        link,
      } satisfies WorkspaceLinkSaveResult;
    }),

    update: Effect.fn("WorkspaceLinkRepository.update")(function* (
      ids: readonly LinkId[],
      patch: WorkspaceLinkPatch
    ) {
      const links = yield* query("findLinksForUpdate", () =>
        store.query(linksByIds$([...ids]))
      );
      const now = yield* DateTime.nowAsDate;
      const changes = yield* Effect.forEach(
        links,
        (link) => updateEvents(link, patch, now),
        { concurrency: 1 }
      ).pipe(Effect.map((groups) => groups.flat()));
      yield* commit("updateLinks", changes);
      const updated = yield* query("readUpdatedLinks", () =>
        store.query(linksByIds$(links.map((link) => link.id)))
      );
      const tags = yield* tagNamesByLink(updated.map((link) => link.id));
      return updated.map((link) => encodeLink(link, tags.get(link.id) ?? []));
    }),

    selectBatch: Effect.fn("WorkspaceLinkRepository.selectBatch")(function* (
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
      };
    }),
  };
};

export class WorkspaceLinkRepository extends Context.Service<
  WorkspaceLinkRepository,
  ReturnType<typeof make>
>()("@cloudstash/WorkspaceLinkRepository") {}

export const WorkspaceLinkRepositoryLive = (
  store: Store<typeof schema>,
  sync: SyncChanges = syncChanges,
  canCommit: CanCommit = () => true
) => Layer.succeed(WorkspaceLinkRepository, make(store, sync, canCommit));
