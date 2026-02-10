import { useTagFilter } from "@/hooks/use-tag-filter";
import { type LinkProjection } from "@/lib/link-projections";
import { type LinkWithDetails } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";

export function useFilteredLinks(
  projection: LinkProjection,
  baseLinks: readonly LinkWithDetails[]
) {
  const store = useAppStore();
  const { tags, untagged, hasFilters } = useTagFilter();

  const filteredQuery = projection.filteredQuery({ tagIds: tags, untagged });
  const filteredLinks = store.useQuery(filteredQuery);

  const links = hasFilters ? filteredLinks : baseLinks;

  return {
    links,
    totalCount: baseLinks.length,
    filteredCount: links.length,
    hasFilters,
  };
}
