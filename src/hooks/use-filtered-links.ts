import { useTagFilter } from "@/hooks/use-tag-filter";
import type { LinkProjection } from "@/lib/link-projections";
import type { LinkListItem } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";

export function useFilteredLinks(
  projection: LinkProjection,
  baseLinks: readonly LinkListItem[]
) {
  const store = useAppStore();
  const { tag, untagged, hasFilters } = useTagFilter();

  const tagIds = tag ? [tag] : [];
  const filteredQuery = projection.filteredQuery({ tagIds, untagged });
  const filteredLinks = store.useQuery(filteredQuery);

  const links = hasFilters ? filteredLinks : baseLinks;

  return {
    links,
    totalCount: baseLinks.length,
    filteredCount: links.length,
    hasFilters,
  };
}
