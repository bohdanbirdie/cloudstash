import { useEffect } from "react";

import { LinkList } from "@/components/link-list/link-list";
import { usePageActions } from "@/components/page-actions-context";
import { PerfProfiler } from "@/components/perf-hud";
import { useFilteredLinks } from "@/hooks/use-filtered-links";
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
  const { links } = useFilteredLinks(projection, baseLinks);
  const { setExportAction } = usePageActions();

  useEffect(() => {
    setExportAction({ links, title });
    return () => setExportAction(null);
  }, [links, title, setExportAction]);

  return (
    <div className="pt-3">
      <PerfProfiler id="LinkList">
        <LinkList links={links} emptyMessage={emptyMessage} />
      </PerfProfiler>
    </div>
  );
}
