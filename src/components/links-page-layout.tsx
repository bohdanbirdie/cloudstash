import { DownloadIcon } from "lucide-react";
import { useState, useCallback } from "react";

import { ExportDialog } from "@/components/export-dialog";
import { FilterBar } from "@/components/filters/filter-bar";
import {
  TagsFilterChips,
  TagsFilterDropdown,
} from "@/components/filters/tags-filter";
import { LinkGrid } from "@/components/link-card/link-grid";
import { ViewSwitcher } from "@/components/link-card/view-switcher";
import { useLinkDetailDialog } from "@/components/link-detail-dialog";
import { PerfProfiler } from "@/components/perf-hud";
import { Button } from "@/components/ui/button";
import { useFilteredLinks } from "@/hooks/use-filtered-links";
import { useTagFilter } from "@/hooks/use-tag-filter";
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
  const { hasFilters, clearFilters } = useTagFilter();

  const { links, totalCount, filteredCount } = useFilteredLinks(
    projection,
    baseLinks
  );

  const [exportOpen, setExportOpen] = useState(false);

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
      <div className="mb-4 flex items-center justify-end gap-2">
        <ViewSwitcher />
        <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
          <DownloadIcon className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      <FilterBar
        dropdowns={<TagsFilterDropdown />}
        chips={<TagsFilterChips />}
        totalCount={totalCount}
        filteredCount={filteredCount}
        hasFilters={hasFilters}
        onClearAll={clearFilters}
        className="mb-4"
      />

      <PerfProfiler id="LinkGrid">
        <LinkGrid
          links={links}
          emptyMessage={emptyMessage}
          onLinkClick={handleLinkClick}
        />
      </PerfProfiler>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        links={links}
        pageTitle={title}
      />
    </div>
  );
}
