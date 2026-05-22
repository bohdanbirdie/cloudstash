import { useMemo } from "react";

import { linksByIds$ } from "@/livestore/queries/links";
import type { LinkWithDetails } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";
import { useRecentLinksStore } from "@/stores/recent-links-store";

export function useRecentLinks(): readonly LinkWithDetails[] {
  const links = useRecentLinksStore((s) => s.links);

  const linkIds = useMemo(() => links.map((l) => l.id), [links]);
  const linksQuery = useMemo(() => linksByIds$(linkIds), [linkIds]);
  const linkDetails = useAppStore().useQuery(linksQuery);

  return useMemo(() => {
    const byId = new Map(linkDetails.map((l) => [l.id, l]));
    return links.flatMap((l) => {
      const link = byId.get(l.id);
      return link ? [link] : [];
    });
  }, [links, linkDetails]);
}
