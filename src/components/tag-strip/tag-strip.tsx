import { memo, useMemo } from "react";

import { useTagFilter } from "@/hooks/use-tag-filter";
import type { LinkStatus } from "@/livestore/queries/filtered-links";
import {
  newTagSuggestionsWithCountsForStatus$,
  tagsWithCountsForStatus$,
} from "@/livestore/queries/tags";
import { useAppStore } from "@/livestore/store";
import { useSelectionStore } from "@/stores/selection-store";

import { TagChip } from "./tag-chip";
import { TagFilterMenu } from "./tag-filter-menu";
import { useInlineTagLimit } from "./use-inline-tag-limit";
import { useRovingTagFocus } from "./use-roving-tag-focus";

interface TagStripProps {
  status: LinkStatus;
}

export const TagStrip = memo(function TagStrip({ status }: TagStripProps) {
  const store = useAppStore();
  const tagsQuery = useMemo(() => tagsWithCountsForStatus$(status), [status]);
  const suggestionsQuery = useMemo(
    () => newTagSuggestionsWithCountsForStatus$(status),
    [status]
  );
  const allTags = store.useQuery(tagsQuery);
  const suggestionTags = store.useQuery(suggestionsQuery);
  const { tag: selectedTag } = useTagFilter();
  const clearSelection = useSelectionStore((s) => s.clear);
  const limit = useInlineTagLimit();

  const inline = allTags.slice(0, limit);
  const inlineIds = new Set(inline.map((t) => t.id));

  const activeOverflow =
    selectedTag && !inlineIds.has(selectedTag)
      ? (allTags.find((t) => t.id === selectedTag) ??
        suggestionTags.find((t) => t.id === selectedTag) ??
        null)
      : null;

  const shownIds = new Set(inlineIds);
  if (activeOverflow) shownIds.add(activeOverflow.id);
  const overflow = allTags.filter((t) => !shownIds.has(t.id));
  const showMenu = overflow.length > 0 || suggestionTags.length > 0;

  const itemIds = inline.map((t) => t.id);
  if (activeOverflow) itemIds.push(activeOverflow.id);

  const { containerRef, tabbableId, handleKeyDown, handleFocus, onApply } =
    useRovingTagFocus({
      itemIds,
      activeId: selectedTag,
      activeOverflowId: activeOverflow?.id ?? null,
    });

  if (allTags.length === 0 && suggestionTags.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label="Filter by tag"
      aria-orientation="horizontal"
      data-tag-strip=""
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      className="mt-4 mb-2 flex w-full flex-wrap items-center gap-x-[10px] gap-y-1.5 px-2 text-xs font-medium"
    >
      {inline.map((tag) => (
        <TagChip
          key={tag.id}
          tag={tag}
          active={selectedTag === tag.id}
          tabbable={tabbableId === tag.id}
          onClick={clearSelection}
        />
      ))}
      {activeOverflow && (
        <TagChip
          key={activeOverflow.id}
          tag={activeOverflow}
          active
          tabbable={tabbableId === activeOverflow.id}
          onClick={clearSelection}
        />
      )}
      {showMenu && (
        <TagFilterMenu
          tags={allTags}
          suggestionTags={suggestionTags}
          activeTag={selectedTag}
          overflow={overflow}
          onApply={onApply}
        />
      )}
    </div>
  );
});
