import { Schema } from "effect";

import { LinkSearchQuery, MAX_LINK_SEARCH_RESULTS } from "./link-search";
import { MAX_TAG_NAME_LENGTH } from "./tags";

export const MAX_LINK_PAGE_SIZE = 100;
export const DEFAULT_LINK_PAGE_SIZE = 50;
export const MAX_LINK_BATCH_SIZE = 100;
export const MAX_LINK_TAGS_PER_MUTATION = 20;

export const LinkCollectionState = Schema.Literals([
  "inbox",
  "completed",
  "active",
  "any",
  "all",
  "archive",
]).pipe(
  Schema.annotate({
    description:
      "Link collection: active includes inbox and completed; archive includes archived links; any includes both. all is a deprecated alias for active.",
  })
);
export type LinkCollectionState = typeof LinkCollectionState.Type;

export const LinkSearchMatch = Schema.Literals(["any", "all"]).pipe(
  Schema.annotate({
    description: "Match any query word (default) or require every query word.",
  })
);
export type LinkSearchMatch = typeof LinkSearchMatch.Type;

export const LinkMutableState = Schema.Literals([
  "inbox",
  "completed",
  "archive",
]);
export type LinkMutableState = typeof LinkMutableState.Type;

export const LinkListSort = Schema.Literals(["newest", "oldest"]);
export type LinkListSort = typeof LinkListSort.Type;

const PageLimit = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
  Schema.isLessThanOrEqualTo(MAX_LINK_PAGE_SIZE)
);

const BatchLimit = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
  Schema.isLessThanOrEqualTo(MAX_LINK_BATCH_SIZE)
);

const SearchLimit = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
  Schema.isLessThanOrEqualTo(MAX_LINK_SEARCH_RESULTS)
);

const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/;

export const isoInstantToEpochMillis = (value: string): number | null => {
  const match = ISO_INSTANT.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, zoneHour, zoneMinute] =
    match;
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > new Date(Date.UTC(y, m, 0)).getUTCDate() ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59 ||
    Number(zoneHour ?? 0) > 23 ||
    Number(zoneMinute ?? 0) > 59
  ) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const Timestamp = Schema.String.check(
  Schema.isPattern(ISO_INSTANT),
  Schema.makeFilter((value) =>
    isoInstantToEpochMillis(value) === null
      ? "Expected an ISO 8601 timestamp with a time-zone"
      : undefined
  )
);
const TagName = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(MAX_TAG_NAME_LENGTH)
);
const TagNames = Schema.Array(TagName).check(
  Schema.isMaxLength(MAX_LINK_TAGS_PER_MUTATION)
);
const LinkIds = Schema.Array(Schema.String.check(Schema.isMinLength(1))).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(MAX_LINK_BATCH_SIZE)
);

export const ListLinksInput = Schema.Struct({
  state: Schema.optionalKey(LinkCollectionState),
  limit: Schema.optionalKey(PageLimit),
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
  sort: Schema.optionalKey(LinkListSort),
  createdAfter: Schema.optionalKey(Timestamp),
  createdBefore: Schema.optionalKey(Timestamp),
});
export type ListLinksInput = typeof ListLinksInput.Type;

export const SearchLinksInput = Schema.Struct({
  query: LinkSearchQuery,
  match: Schema.optionalKey(LinkSearchMatch),
  state: Schema.optionalKey(LinkCollectionState),
  limit: Schema.optionalKey(SearchLimit),
  createdAfter: Schema.optionalKey(Timestamp),
  createdBefore: Schema.optionalKey(Timestamp),
});
export type SearchLinksInput = typeof SearchLinksInput.Type;

export const SaveLinkInput = Schema.Struct({
  url: Schema.String.check(Schema.isMinLength(1)),
  tags: Schema.optionalKey(TagNames),
});
export type SaveLinkInput = typeof SaveLinkInput.Type;

export const LinkTagChanges = Schema.Struct({
  add: Schema.optionalKey(TagNames),
  remove: Schema.optionalKey(TagNames),
  set: Schema.optionalKey(TagNames),
});
export type LinkTagChanges = typeof LinkTagChanges.Type;

export const LinkChanges = Schema.Struct({
  state: Schema.optionalKey(LinkMutableState),
  tags: Schema.optionalKey(LinkTagChanges),
});
export type LinkChanges = typeof LinkChanges.Type;

export const UpdateLinkInput = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  changes: LinkChanges,
});
export type UpdateLinkInput = typeof UpdateLinkInput.Type;

export const LinkBatchFilter = Schema.Struct({
  state: Schema.optionalKey(LinkCollectionState),
  createdAfter: Schema.optionalKey(Timestamp),
  createdBefore: Schema.optionalKey(Timestamp),
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
});
export type LinkBatchFilter = typeof LinkBatchFilter.Type;

export const UpdateLinksInput = Schema.Struct({
  ids: Schema.optionalKey(LinkIds),
  where: Schema.optionalKey(LinkBatchFilter),
  changes: LinkChanges,
  limit: Schema.optionalKey(BatchLimit),
}).check(
  Schema.makeFilter((input) =>
    input.ids !== undefined &&
    input.limit !== undefined &&
    input.ids.length > input.limit
      ? "ids cannot contain more entries than limit"
      : undefined
  )
);
export type UpdateLinksInput = typeof UpdateLinksInput.Type;

export const GetLinkInput = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
});
export type GetLinkInput = typeof GetLinkInput.Type;
