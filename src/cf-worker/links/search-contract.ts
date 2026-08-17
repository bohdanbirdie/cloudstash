export const MAX_LINK_SEARCH_QUERY_CHARS = 200;
export const MAX_LINK_SEARCH_RESULTS = 20;

export const normalizeLinkSearchQuery = (query: string): string | null => {
  const normalized = query.trim();
  return normalized.length > 0 &&
    normalized.length <= MAX_LINK_SEARCH_QUERY_CHARS
    ? normalized
    : null;
};
