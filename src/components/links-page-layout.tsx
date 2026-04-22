import { useCallback, useEffect } from "react";

import { useLinkDetailDialog } from "@/components/link-detail-dialog";
import { LinkList } from "@/components/link-list/link-list";
import { usePageActions } from "@/components/page-actions-context";
import { PerfProfiler } from "@/components/perf-hud";
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
  const { open: openDialog } = useLinkDetailDialog();
  const { links } = useFilteredLinks(projection, baseLinks);
  const { setExportAction } = usePageActions();

  useEffect(() => {
    setExportAction({ links, title });
    return () => setExportAction(null);
  }, [links, title, setExportAction]);

  const handleLinkClick = useCallback(
    (index: number) => {
      const link = links[index];
      if (link) {
        trackLinkOpen(link.id);
        openDialog({ linkId: link.id, projection });
      }
    },
    [links, trackLinkOpen, openDialog, projection]
  );

  return (
    <div className="pt-6">
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
