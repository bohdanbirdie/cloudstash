import { useEffect, useMemo } from "react";

import { useTagFilter } from "@/hooks/use-tag-filter";
import { filteredLinks$ } from "@/livestore/queries/filtered-links";
import type { LinkStatus } from "@/livestore/queries/filtered-links";
import type { LinkListItem } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";
import { useSelectionStore } from "@/stores/selection-store";

export function useFilteredLinks(
  status: LinkStatus | undefined
): readonly LinkListItem[] {
  const store = useAppStore();
  const { tag } = useTagFilter();
  const query = useMemo(
    () => filteredLinks$(status, { tagIds: tag ? [tag] : [] }),
    [status, tag]
  );
  const links = store.useQuery(query);

  useEffect(() => {
    const validIds = new Set(links.map((l) => l.id));
    useSelectionStore.getState().prune(validIds);
  }, [links]);

  return links;
}
