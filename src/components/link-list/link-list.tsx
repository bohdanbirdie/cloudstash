import { useCallback, useEffect, useMemo, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useListData } from "@/components/list-data-context";
import { useTrackLinkOpen } from "@/hooks/use-track-link-open";
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

const LISTBOX_HOTKEY_OPTIONS = {
  preventDefault: true,
  enableOnFormTags: ["option"] as const,
};

interface LinkListProps {
  links: readonly LinkListItemData[];
  emptyMessage?: string;
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
}: LinkListProps) {
  const activeLinkId = useRightPaneStore((s) => s.activeLinkId);
  const openDetail = useRightPaneStore((s) => s.openDetail);
  const toggleDetail = useRightPaneStore((s) => s.toggleDetail);
  const trackLinkOpen = useTrackLinkOpen();
  const { tagsByLink, statusByLink } = useListData();

  const linksRef = useRef(links);
  linksRef.current = links;
  const activeLinkIdRef = useRef(activeLinkId);
  activeLinkIdRef.current = activeLinkId;
  const anchorRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allIds = useMemo(() => links.map((l) => l.id), [links]);

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

  const tabbableId = activeLinkId ?? links[0]?.id ?? null;

  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      const id = (e.currentTarget as HTMLElement).dataset.id;
      if (!id) return;

      const items = linksRef.current;
      if (items.findIndex((l) => l.id === id) === -1) return;

      const mod = modifierFromEvent(e);
      const itemIds = items.map((l) => l.id);
      const activeId = activeLinkIdRef.current;

      useSelectionStore.getState().click(id, mod, itemIds, activeId);

      if (mod === "none") {
        if (id !== activeId) trackLinkOpen(id);
        anchorRef.current = id;
        toggleDetail(id);
      }
    },
    [trackLinkOpen, toggleDetail]
  );

  const handleCheckboxClick = useCallback((id: string) => {
    useSelectionStore.getState().toggleCheckbox(id);
  }, []);

  const handleRowMouseEnter = useCallback((e: React.MouseEvent) => {
    const row = e.currentTarget as HTMLElement;
    const id = row.dataset.id;
    if (!id) return;
    anchorRef.current = id;
    useSelectionStore.getState().setHovered(id);
    if (containerRef.current) {
      clearKeyboardFocusFromOtherRow(containerRef.current, row);
    }
  }, []);

  const handleListMouseLeave = useCallback(() => {
    useSelectionStore.getState().setHovered(null);
  }, []);

  const handleListFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const id = target.dataset?.id;
    if (id) anchorRef.current = id;
  };

  const moveByKey = (delta: number | "home" | "end") => {
    const items = linksRef.current;
    const cursor = activeLinkIdRef.current ?? anchorRef.current;
    const targetIdx = computeTargetIndex(items, cursor, delta);
    const target = items[targetIdx];
    if (!target) return;

    focusRowById(containerRef.current, target.id);
    anchorRef.current = target.id;

    if (activeLinkIdRef.current && target.id !== activeLinkIdRef.current) {
      trackLinkOpen(target.id);
      openDetail(target.id);
    }
  };

  useHotkeys("down,j", () => moveByKey(1), LISTBOX_HOTKEY_OPTIONS);
  useHotkeys("up,k", () => moveByKey(-1), LISTBOX_HOTKEY_OPTIONS);
  useHotkeys("home", () => moveByKey("home"), LISTBOX_HOTKEY_OPTIONS);
  useHotkeys("end", () => moveByKey("end"), LISTBOX_HOTKEY_OPTIONS);

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
      className="flex flex-col gap-3 min-w-0"
      onFocus={handleListFocus}
      onMouseLeave={handleListMouseLeave}
    >
      {links.map((link) => (
        <LinkListItem
          key={link.id}
          link={link}
          tags={tagsByLink.get(link.id) ?? EMPTY_TAGS}
          processingStatus={statusByLink.get(link.id) ?? null}
          active={link.id === activeLinkId}
          selected={ids.has(link.id)}
          previewing={previewSet.has(link.id)}
          tabbable={link.id === tabbableId}
          onClick={handleRowClick}
          onMouseEnter={handleRowMouseEnter}
          onCheckboxClick={handleCheckboxClick}
        />
      ))}
    </div>
  );
}
