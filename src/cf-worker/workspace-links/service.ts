import { Context, Effect, Layer, Option, Schema } from "effect";

import { HttpUrlFromString } from "@/lib/http-url";
import { MAX_LINK_SEARCH_RESULTS } from "@/lib/link-search";
import {
  DEFAULT_LINK_PAGE_SIZE,
  isoInstantToEpochMillis,
  MAX_LINK_BATCH_SIZE,
} from "@/lib/links-contract";
import type {
  LinkChanges,
  ListLinksInput,
  SaveLinkInput,
  SearchLinksInput,
  UpdateLinkInput,
  UpdateLinksInput,
} from "@/lib/links-contract";
import { isValidTagName, sanitizeTagName } from "@/lib/tags";

import { LinkId } from "../db/branded";
import { decodeCursor } from "../links/api";
import {
  WorkspaceLinkInvalidInputError,
  WorkspaceLinkNotFoundError,
} from "./errors";
import { WorkspaceLinkRepository } from "./repository";
import type { WorkspaceLinkPatch } from "./repository";

const decodeUrl = Schema.decodeUnknownOption(HttpUrlFromString);

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

const make = Effect.gen(function* () {
  const repository = yield* WorkspaceLinkRepository;

  const requireLink = Effect.fnUntraced(function* (id: string) {
    const linkId = LinkId.make(id);
    const link = yield* repository.get(linkId);
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
      return yield* repository.list({
        state: input.state ?? "active",
        limit: input.limit ?? DEFAULT_LINK_PAGE_SIZE,
        cursor,
        sort: input.sort ?? "newest",
        createdAfter,
        createdBefore,
      });
    }),

    search: Effect.fn("WorkspaceLinks.search")(function* (
      input: SearchLinksInput
    ) {
      const { createdAfter, createdBefore } = yield* dateRange(
        input.createdAfter,
        input.createdBefore
      );
      return yield* repository.search({
        query: input.query,
        match: input.match ?? "any",
        state: input.state ?? "active",
        limit: input.limit ?? MAX_LINK_SEARCH_RESULTS,
        createdAfter,
        createdBefore,
      });
    }),

    get: Effect.fn("WorkspaceLinks.get")(function* (id: string) {
      return yield* requireLink(id);
    }),

    save: Effect.fn("WorkspaceLinks.save")(function* (
      input: SaveLinkInput & { readonly source: "api" | "mcp" }
    ) {
      const decoded = decodeUrl(input.url);
      const url = yield* Option.match(decoded, {
        onNone: () => Effect.fail(invalid("url must be an HTTP(S) URL")),
        onSome: Effect.succeed,
      });
      const tags = (yield* normalizeTags(input.tags)) ?? [];
      return yield* repository.save({ url, tags, source: input.source });
    }),

    update: Effect.fn("WorkspaceLinks.update")(function* (
      input: UpdateLinkInput
    ) {
      const patch = yield* normalizeChanges(input.changes);
      const linkId = LinkId.make(input.id);
      const updated = yield* repository.update([linkId], patch);
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
      const selected = yield* repository.selectBatch(
        ids === undefined
          ? {
              where: {
                state: input.where?.state ?? "active",
                limit,
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
      const links = yield* repository.update(selected.ids, patch);
      return {
        links,
        updated: links.length,
        nextCursor: selected.nextCursor,
      };
    }),
  };
});

export class WorkspaceLinks extends Context.Service<
  WorkspaceLinks,
  Effect.Success<typeof make>
>()("@cloudstash/WorkspaceLinks") {
  static readonly layer = Layer.effect(WorkspaceLinks, make);
}
