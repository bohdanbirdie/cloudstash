import { useCallback, useMemo, useRef } from "react";

import { useListData } from "@/components/list-data-context";
import { useTrackLinkOpen } from "@/hooks/use-track-link-open";
import type { LinkListItem as LinkListItemData } from "@/livestore/queries/links";
import type { Tag } from "@/livestore/queries/tags";
import { useViewModeStore } from "@/stores/view-mode-store";

import { LinkCard } from "./link-card";
import { LinkListItem } from "./link-list-item";

interface LinkGridProps {
  links: readonly LinkListItemData[];
  emptyMessage?: string;
  onLinkClick?: (index: number) => void;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  year: "numeric",
});

const EMPTY_TAGS: readonly Tag[] = [];

function useFormattedDatesByLink(
  links: readonly LinkListItemData[]
): Map<string, string> {
  const cacheRef = useRef<
    Map<string, { createdAt: number; formatted: string }>
  >(new Map());

  return useMemo(() => {
    const out = new Map<string, string>();
    const nextCache = new Map<
      string,
      { createdAt: number; formatted: string }
    >();
    for (const link of links) {
      const cached = cacheRef.current.get(link.id);
      if (cached && cached.createdAt === link.createdAt) {
        out.set(link.id, cached.formatted);
        nextCache.set(link.id, cached);
        continue;
      }
      const formatted = dateFormatter.format(new Date(link.createdAt));
      out.set(link.id, formatted);
      nextCache.set(link.id, { createdAt: link.createdAt, formatted });
    }
    cacheRef.current = nextCache;
    return out;
  }, [links]);
}

export function LinkGrid({
  links,
  emptyMessage = "No links yet",
  onLinkClick,
}: LinkGridProps) {
  const viewMode = useViewModeStore((s) => s.viewMode);
  const trackLinkOpen = useTrackLinkOpen();

  const { tagsByLink, statusByLink } = useListData();
  const formattedDates = useFormattedDatesByLink(links);

  const linksRef = useRef(links);
  linksRef.current = links;

  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.currentTarget as HTMLElement;
      const id = target.getAttribute("data-id");
      if (!id) return;
      const currentLinks = linksRef.current;
      const index = currentLinks.findIndex((l) => l.id === id);
      if (index === -1) return;
      const link = currentLinks[index];
      if (link) {
        trackLinkOpen(link.id);
      }
      onLinkClick?.(index);
    },
    [trackLinkOpen, onLinkClick]
  );

  if (links.length === 0) {
    return (
      <div className="text-muted-foreground text-center py-12">
        {emptyMessage}
      </div>
    );
  }

  if (viewMode === "list") {
    return (
      <div className="flex flex-col gap-3 min-w-0">
        {links.map((link) => (
          <LinkListItem
            key={link.id}
            link={link}
            tags={tagsByLink.get(link.id) ?? EMPTY_TAGS}
            processingStatus={statusByLink.get(link.id) ?? null}
            formattedDate={formattedDates.get(link.id) ?? ""}
            onClick={handleRowClick}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-4 @sm:grid-cols-2 @lg:grid-cols-3 @3xl:grid-cols-4">
        {links.map((link) => (
          <LinkCard
            key={link.id}
            link={link}
            tags={tagsByLink.get(link.id) ?? EMPTY_TAGS}
            processingStatus={statusByLink.get(link.id) ?? null}
            formattedDate={formattedDates.get(link.id) ?? ""}
            onClick={handleRowClick}
          />
        ))}
      </div>
    </div>
  );
}
