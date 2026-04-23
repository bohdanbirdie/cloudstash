import { useCallback, useEffect } from "react";

import { LinkList } from "@/components/link-list/link-list";
import { usePageActions } from "@/components/page-actions-context";
import { PerfProfiler } from "@/components/perf-hud";
import { useRightPane } from "@/components/right-pane-context";
import { useFilteredLinks } from "@/hooks/use-filtered-links";
import { useTrackLinkOpen } from "@/hooks/use-track-link-open";
import type { LinkProjection } from "@/lib/link-projections";
import type { LinkListItem } from "@/livestore/queries/links";

interface LinksPageLayoutProps {
  title: string;
  links: readonly LinkListItem[];
  emptyMessage: string;
  projection: LinkProjection;
}

export function LinksPageLayout({
  title,
  links: baseLinks,
  emptyMessage,
  projection,
}: LinksPageLayoutProps) {
  const trackLinkOpen = useTrackLinkOpen();
  const { activeLinkId, toggleDetail } = useRightPane();
  const { links } = useFilteredLinks(projection, baseLinks);
  const { setExportAction } = usePageActions();

  useEffect(() => {
    setExportAction({ links, title });
    return () => setExportAction(null);
  }, [links, title, setExportAction]);

  const handleLinkClick = useCallback(
    (index: number) => {
      const link = links[index];
      if (!link) return;
      if (link.id !== activeLinkId) {
        trackLinkOpen(link.id);
      }
      toggleDetail({ linkId: link.id, projection });
    },
    [links, activeLinkId, trackLinkOpen, toggleDetail, projection]
  );

  return (
    <div className="pt-3">
      <PerfProfiler id="LinkList">
        <LinkList
          links={links}
          emptyMessage={emptyMessage}
          onLinkClick={handleLinkClick}
        />
      </PerfProfiler>
    </div>
  );
}
