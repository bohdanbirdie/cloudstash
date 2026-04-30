import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useListData } from "@/components/list-data-context";
import {
  useRightPaneActions,
  useRightPaneState,
} from "@/components/right-pane-context";
import { useTrackLinkOpen } from "@/hooks/use-track-link-open";
import {
  clearKeyboardFocusFromOtherRow,
  computeTargetIndex,
  findRowInContainer,
  focusRowById,
} from "@/lib/listbox-keyboard";
import { formatAgo } from "@/lib/time-ago";
import type { LinkListItem as LinkListItemData } from "@/livestore/queries/links";
import type { Tag } from "@/livestore/queries/tags";
import {
  useInSelectionMode,
  useSelectionStore,
} from "@/stores/selection-store";

import { LinkListItem } from "./link-list-item";

interface LinkListProps {
  links: readonly LinkListItemData[];
  emptyMessage?: string;
}

const EMPTY_TAGS: readonly Tag[] = [];

const LISTBOX_HOTKEY_OPTIONS = {
  preventDefault: true,
  enableOnFormTags: ["option"] as const,
};

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
      const formatted = formatAgo(link.createdAt);
      out.set(link.id, formatted);
      nextCache.set(link.id, { createdAt: link.createdAt, formatted });
    }
    cacheRef.current = nextCache;
    return out;
  }, [links]);
}

export function LinkList({
  links,
  emptyMessage = "No links yet",
}: LinkListProps) {
  const { activeLinkId } = useRightPaneState();
  const { openDetail, toggleDetail } = useRightPaneActions();
  const trackLinkOpen = useTrackLinkOpen();
  const { tagsByLink, statusByLink } = useListData();
  const formattedDates = useFormattedDatesByLink(links);

  const linksRef = useRef(links);
  linksRef.current = links;
  const activeLinkIdRef = useRef(activeLinkId);
  activeLinkIdRef.current = activeLinkId;
  const anchorRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [tabStop, setTabStop] = useState<string | null>(null);
  const tabbableId = activeLinkId ?? tabStop ?? links[0]?.id ?? null;

  const inSelectionMode = useInSelectionMode();

  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      const id = (e.currentTarget as HTMLElement).dataset.id;
      if (!id) return;

      const items = linksRef.current;
      const index = items.findIndex((l) => l.id === id);
      if (index === -1) return;

      const selection = useSelectionStore.getState();

      if (e.metaKey || e.ctrlKey) {
        selection.toggle(id, index);
        return;
      }

      if (e.shiftKey) {
        if (selection.anchorIndex === null) {
          selection.toggle(id, index);
        } else {
          selection.range(
            index,
            items.map((l) => l.id)
          );
        }
        return;
      }

      if (id !== activeLinkIdRef.current) trackLinkOpen(id);
      anchorRef.current = id;
      setTabStop(id);
      toggleDetail({ linkId: id });
    },
    [trackLinkOpen, toggleDetail]
  );

  useEffect(() => {
    const validIds = new Set(links.map((l) => l.id));
    useSelectionStore.getState().removeStale(validIds);
  }, [links]);

  // Telegraphs "click would toggle / extend" via a primary-color ring on the
  // hovered row whenever ⌘/⌃/⇧ is held. Mutates a DOM attribute directly —
  // CSS handles the visual, the 244 memoized rows stay quiet.
  useEffect(() => {
    const sync = (e: KeyboardEvent | FocusEvent) => {
      const node = containerRef.current;
      if (!node) return;
      const held =
        e instanceof KeyboardEvent && (e.metaKey || e.ctrlKey || e.shiftKey);
      if (held === node.hasAttribute("data-modifier-held")) return;
      if (held) node.setAttribute("data-modifier-held", "");
      else node.removeAttribute("data-modifier-held");
    };
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("blur", sync);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("blur", sync);
    };
  }, []);

  const handleMouseOver = (e: React.MouseEvent<HTMLDivElement>) => {
    const row = findRowInContainer(e.target, containerRef.current);
    if (!row) return;
    const id = row.dataset.id;
    if (!id) return;
    anchorRef.current = id;
    if (containerRef.current) {
      clearKeyboardFocusFromOtherRow(containerRef.current, row);
    }
  };

  const moveByKey = (delta: number | "home" | "end") => {
    const items = linksRef.current;
    const cursor = activeLinkIdRef.current ?? anchorRef.current;
    const targetIdx = computeTargetIndex(items, cursor, delta);
    const target = items[targetIdx];
    if (!target) return;

    focusRowById(containerRef.current, target.id);
    anchorRef.current = target.id;
    setTabStop(target.id);

    if (activeLinkIdRef.current && target.id !== activeLinkIdRef.current) {
      trackLinkOpen(target.id);
      openDetail({ linkId: target.id });
    }
  };

  const activate = () => {
    const cursor = activeLinkIdRef.current ?? anchorRef.current;
    if (!cursor) return;
    if (cursor !== activeLinkIdRef.current) trackLinkOpen(cursor);
    openDetail({ linkId: cursor });
  };

  useHotkeys("down,j", () => moveByKey(1), LISTBOX_HOTKEY_OPTIONS);
  useHotkeys("up,k", () => moveByKey(-1), LISTBOX_HOTKEY_OPTIONS);
  useHotkeys("home", () => moveByKey("home"), LISTBOX_HOTKEY_OPTIONS);
  useHotkeys("end", () => moveByKey("end"), LISTBOX_HOTKEY_OPTIONS);
  useHotkeys("enter", activate, LISTBOX_HOTKEY_OPTIONS);

  if (links.length === 0) {
    return (
      <div className="text-muted-foreground text-center py-12">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Links"
      aria-multiselectable="true"
      data-selection-mode={inSelectionMode ? "" : undefined}
      className="group/list flex flex-col gap-3 min-w-0"
      onMouseOver={handleMouseOver}
    >
      {links.map((link) => (
        <LinkListItem
          key={link.id}
          link={link}
          tags={tagsByLink.get(link.id) ?? EMPTY_TAGS}
          processingStatus={statusByLink.get(link.id) ?? null}
          formattedDate={formattedDates.get(link.id) ?? ""}
          active={link.id === activeLinkId}
          tabbable={link.id === tabbableId}
          onClick={handleRowClick}
        />
      ))}
    </div>
  );
}
