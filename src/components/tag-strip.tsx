import { useMemo, useState } from "react";

import { useTagFilter } from "@/hooks/use-tag-filter";
import { cn } from "@/lib/utils";
import { allTagsWithCounts$ } from "@/livestore/queries/tags";
import { useAppStore } from "@/livestore/store";

const MAX_VISIBLE_TAGS = 5;

export function TagStrip() {
  const store = useAppStore();
  const tags = store.useQuery(allTagsWithCounts$);
  const { tag: selectedTag, untagged, setTag, setUntagged } = useTagFilter();

  const [expanded, setExpanded] = useState(false);

  const sortedTags = useMemo(
    () => [...tags].toSorted((a, b) => b.count - a.count),
    [tags]
  );

  if (sortedTags.length === 0 && !untagged) {
    return null;
  }

  const hidden = Math.max(0, sortedTags.length - MAX_VISIBLE_TAGS);
  const visible = expanded ? sortedTags : sortedTags.slice(0, MAX_VISIBLE_TAGS);

  return (
    <div className="flex w-full flex-wrap items-baseline gap-[10px] text-xs font-medium">
      <button
        type="button"
        onClick={() => setUntagged(!untagged)}
        className={cn(
          "text-foreground/40 transition-colors hover:text-foreground",
          untagged && "text-primary"
        )}
        aria-pressed={untagged}
        title="Filter to links with no tags"
      >
        untagged
      </button>
      {visible.map((tag) => {
        const active = selectedTag === tag.id;
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => setTag(active ? null : tag.id)}
            className={cn(
              "text-foreground/40 transition-colors hover:text-foreground",
              active && "text-primary"
            )}
            aria-pressed={active}
          >
            #{tag.name}
          </button>
        );
      })}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-foreground/40 transition-colors hover:text-foreground"
          aria-expanded={expanded}
        >
          {expanded ? "less" : `+${hidden} more`}
        </button>
      )}
    </div>
  );
}
