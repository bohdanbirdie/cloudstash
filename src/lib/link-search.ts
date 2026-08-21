import { Option, Schema } from "effect";

export const MAX_LINK_SEARCH_QUERY_CHARS = 200;
export const MAX_LINK_SEARCH_RESULTS = 20;

const BoundedSearchText = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(MAX_LINK_SEARCH_QUERY_CHARS)
);

export const LinkSearchQuery = BoundedSearchText.pipe(
  Schema.decodeTo(
    Schema.Trim.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(MAX_LINK_SEARCH_QUERY_CHARS)
    )
  )
);
const decodeLinkSearchQuery = Schema.decodeUnknownOption(LinkSearchQuery);

export const normalizeLinkSearchQuery = (query: string): string | null => {
  const decoded = decodeLinkSearchQuery(query);
  return Option.isSome(decoded) ? decoded.value : null;
};
