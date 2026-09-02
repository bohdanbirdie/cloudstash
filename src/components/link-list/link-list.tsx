import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isInActivityGrid } from "@/components/activity-grid/owns-arrows";
import { isInDock } from "@/components/bottom-dock/owns-arrows";
import { useListData } from "@/components/list-data-context";
import { isInTagStrip } from "@/components/tag-strip/owns-arrows";
import { Kbd } from "@/components/ui/kbd";
import { useTrackLinkOpen } from "@/hooks/use-track-link-open";
import { isMac } from "@/lib/hotkey-label";
import { isKeyboardMode } from "@/lib/input-mode";
import { useCommand, useGlobalNavigation } from "@/lib/keyboard";
import {
  clearKeyboardFocusFromOtherRow,
  computeTargetIndex,
  focusRowById,
} from "@/lib/listbox-keyboard";
import { transition } from "@/lib/selection-model";
import type { Modifier } from "@/lib/selection-model";
import type { LinkListItem as LinkListItemData } from "@/livestore/queries/links";
import type { Tag } from "@/livestore/queries/tags";
import { useRightPaneStore } from "@/stores/right-pane-store";
import { useSelectionStore } from "@/stores/selection-store";

import { LinkListItem } from "./link-list-item";

const EMPTY_TAGS: readonly Tag[] = [];
const EMPTY_PREVIEW: ReadonlySet<string> = new Set();

interface LinkListProps {
  links: readonly LinkListItemData[];
  emptyMessage?: string;
  showPasteHint?: boolean;
  listKey?: string;
}

function modifierFromEvent(e: {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}): Modifier {
  if (e.metaKey || e.ctrlKey) return "meta";
  if (e.shiftKey) return "shift";
  return "none";
}

export function LinkList({
  links,
  emptyMessage = "No links yet",
  showPasteHint = false,
  listKey,
}: LinkListProps) {
  const activeLinkId = useRightPaneStore((s) => s.activeLinkId);
  const openDetail = useRightPaneStore((s) => s.openDetail);
  const toggleDetail = useRightPaneStore((s) => s.toggleDetail);
  const trackLinkOpen = useTrackLinkOpen();
  const { tagsByLink } = useListData();

  const anchorRef = useRef<string | null>(null);

  const allIds = useMemo(() => links.map((l) => l.id), [links]);
  const [listTracking, setListTracking] = useState(() => ({
    allIds,
    listKey,
    newIds: new Set<string>(),
  }));
  if (listTracking.allIds !== allIds || listTracking.listKey !== listKey) {
    const newIds = new Set<string>();
    if (listTracking.listKey === listKey) {
      const previousIds = new Set(listTracking.allIds);
      for (const id of allIds) {
        if (!previousIds.has(id)) newIds.add(id);
      }
    }
    setListTracking({ allIds, listKey, newIds });
  }
  const newIds = listTracking.newIds;

  const ids = useSelectionStore((s) => s.ids);
  const anchor = useSelectionStore((s) => s.anchor);
  const hoveredId = useSelectionStore((s) => s.hoveredId);
  const modifier = useSelectionStore((s) => s.modifier);

  useEffect(() => {
    const sync = (e: KeyboardEvent | FocusEvent) => {
      let next: Modifier = "none";
      if (e instanceof KeyboardEvent) {
        if (e.metaKey || e.ctrlKey) next = "meta";
        else if (e.shiftKey) next = "shift";
      }
      useSelectionStore.getState().setModifier(next);
    };
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("blur", sync);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("blur", sync);
      useSelectionStore.getState().setHovered(null);
      useSelectionStore.getState().setModifier("none");
    };
  }, []);

  const previewSet = useMemo(() => {
    if (hoveredId === null || modifier === "none") return EMPTY_PREVIEW;
    const next = transition(
      { activeId: activeLinkId, allIds, anchor, ids },
      { id: hoveredId, modifier, type: "click" }
    );
    if (next.ids === ids) return EMPTY_PREVIEW;
    const result = new Set<string>();
    for (const id of next.ids) {
      if (!ids.has(id)) result.add(id);
    }
    for (const id of ids) {
      if (!next.ids.has(id)) result.add(id);
    }
    return result;
  }, [ids, anchor, allIds, activeLinkId, hoveredId, modifier]);

  // The detail pane may hold a link the current filter excludes, which is
  // intended. The tab stop cannot follow it there or the list has none.
  const visibleIds = useMemo(() => new Set(allIds), [allIds]);
  const tabbableId =
    (activeLinkId && visibleIds.has(activeLinkId) ? activeLinkId : null) ??
    links[0]?.id ??
    null;

  const containerRef = useRef<HTMLDivElement>(null);

  const moveByKey = useCallback(
    (delta: number | "home" | "end") => {
      const cursor = activeLinkId ?? anchorRef.current;
      const targetIdx = computeTargetIndex(links, cursor, delta);
      const target = links[targetIdx];
      if (!target) return;

      focusRowById(containerRef.current, target.id);
      anchorRef.current = target.id;

      if (activeLinkId && target.id !== activeLinkId) {
        trackLinkOpen(target.id);
        openDetail(target.id);
      }
    },
    [activeLinkId, links, openDetail, trackLinkOpen]
  );

  useGlobalNavigation(
    "listNav",
    (dir) => {
      if (dir === "ArrowDown") moveByKey(1);
      else if (dir === "ArrowUp") moveByKey(-1);
      else if (dir === "Home") moveByKey("home");
      else if (dir === "End") moveByKey("end");
    },
    (e) => isInActivityGrid(e) || isInDock(e) || isInTagStrip(e)
  );

  useCommand("vimDown", () => moveByKey(1));
  useCommand("vimUp", () => moveByKey(-1));

  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      const id = (e.currentTarget as HTMLElement).dataset.id;
      if (!id) return;

      const items = links;
      if (items.findIndex((l) => l.id === id) === -1) return;

      const mod = modifierFromEvent(e);
      const itemIds = items.map((l) => l.id);
      const activeId = activeLinkId;

      useSelectionStore.getState().click(id, mod, itemIds, activeId);

      if (mod === "none") {
        if (id !== activeId) trackLinkOpen(id);
        anchorRef.current = id;
        toggleDetail(id);
      }
    },
    [activeLinkId, links, trackLinkOpen, toggleDetail]
  );

  const handleCheckboxClick = useCallback((id: string) => {
    useSelectionStore.getState().toggleCheckbox(id);
  }, []);

  const handleRowMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      if (isKeyboardMode()) return;
      const row = e.currentTarget as HTMLElement;
      const id = row.dataset.id;
      if (!id) return;
      useSelectionStore.getState().setHovered(id);
      if (!activeLinkId) anchorRef.current = id;
      if (containerRef.current) {
        clearKeyboardFocusFromOtherRow(containerRef.current, row);
      }
    },
    [activeLinkId]
  );

  const handleListMouseLeave = useCallback(() => {
    useSelectionStore.getState().setHovered(null);
  }, []);

  const handleListFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const id = target.dataset?.id;
    if (id) anchorRef.current = id;
  };

  const rows = useMemo(() => {
    if (links.length === 0) {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex min-h-64 flex-col items-center justify-center px-4 py-16 text-center"
        >
          <div className="flex max-w-sm flex-col items-center gap-5">
            <div className="flex flex-col gap-2">
              <p className="text-lg font-semibold tracking-tight">
                {emptyMessage}
              </p>
              {showPasteHint && (
                <p className="text-pretty text-sm/6 text-muted-foreground">
                  Copy a link, then paste it anywhere in Cloudstash to save it.
                </p>
              )}
            </div>

            {showPasteHint && (
              <>
                <div
                  className="hidden items-center gap-2 sm:flex"
                  aria-hidden="true"
                >
                  <Kbd className="h-10 min-w-10 rounded-md px-3 text-sm shadow-sm">
                    {isMac ? "⌘" : "Ctrl"}
                  </Kbd>
                  <span className="text-sm text-muted-foreground">+</span>
                  <Kbd className="h-10 min-w-10 rounded-md px-3 text-sm shadow-sm">
                    V
                  </Kbd>
                </div>
                <p className="text-xs text-muted-foreground sm:hidden">
                  Use Add link above to paste from your clipboard.
                </p>
              </>
            )}
          </div>
        </motion.div>
      );
    }
    return links.map((link) => (
      <LinkListItem
        key={link.id}
        link={link}
        tags={tagsByLink.get(link.id) ?? EMPTY_TAGS}
        active={link.id === activeLinkId}
        selected={ids.has(link.id)}
        previewing={previewSet.has(link.id)}
        tabbable={link.id === tabbableId}
        isNew={newIds.has(link.id)}
        onClick={handleRowClick}
        onMouseEnter={handleRowMouseEnter}
        onCheckboxClick={handleCheckboxClick}
      />
    ));
  }, [
    links,
    emptyMessage,
    showPasteHint,
    tagsByLink,
    activeLinkId,
    ids,
    previewSet,
    tabbableId,
    newIds,
    handleRowClick,
    handleRowMouseEnter,
    handleCheckboxClick,
  ]);

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Links"
      aria-multiselectable="true"
      tabIndex={-1}
      className="flex flex-col gap-1 min-w-0 outline-none"
      onFocus={handleListFocus}
      onMouseLeave={handleListMouseLeave}
    >
      {rows}
    </div>
  );
}
