import { Link } from "@tanstack/react-router";
import { memo, useMemo, useState } from "react";

import { useTagFilter } from "@/hooks/use-tag-filter";
import { cn } from "@/lib/utils";
import { allTagsWithCounts$ } from "@/livestore/queries/tags";
import { useAppStore } from "@/livestore/store";
import { useSelectionStore } from "@/stores/selection-store";

const MAX_VISIBLE_TAGS = 5;

export const TagStrip = memo(function TagStrip() {
  const store = useAppStore();
  const tags = store.useQuery(allTagsWithCounts$);
  const { tag: selectedTag } = useTagFilter();
  const clearSelection = useSelectionStore((s) => s.clear);

  const [expanded, setExpanded] = useState(false);

  const sortedTags = useMemo(
    () => [...tags].toSorted((a, b) => b.count - a.count),
    [tags]
  );

  if (sortedTags.length === 0) {
    return null;
  }

  const hidden = Math.max(0, sortedTags.length - MAX_VISIBLE_TAGS);
  const visible = expanded ? sortedTags : sortedTags.slice(0, MAX_VISIBLE_TAGS);

  return (
    <div className="flex w-full flex-wrap items-baseline gap-[10px] text-xs font-medium">
      {visible.map((tag) => {
        const active = selectedTag === tag.id;
        return (
          <Link
            key={tag.id}
            to="."
            search={(prev) => ({ ...prev, tag: active ? undefined : tag.id })}
            onClick={clearSelection}
            className={cn(
              "cursor-pointer text-foreground/40 transition-colors hover:text-foreground",
              active && "text-primary"
            )}
          >
            #{tag.name}
          </Link>
        );
      })}
      {hidden > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-foreground/40 transition-colors hover:text-foreground"
        >
          +{hidden} more
        </button>
      )}
    </div>
  );
});
