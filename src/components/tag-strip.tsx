import { Link } from "@tanstack/react-router";
import { SparklesIcon } from "lucide-react";
import { motion } from "motion/react";
import { memo, useMemo } from "react";

import { useTagFilter } from "@/hooks/use-tag-filter";
import { cn } from "@/lib/utils";
import type { LinkStatus } from "@/livestore/queries/filtered-links";
import type { TagWithCount } from "@/livestore/queries/schemas";
import {
  newTagSuggestionsWithCountsForStatus$,
  tagsWithCountsForStatus$,
} from "@/livestore/queries/tags";
import { useAppStore } from "@/livestore/store";
import { useSelectionStore } from "@/stores/selection-store";

const underlineTransition = {
  duration: 0.18,
  ease: [0.25, 1, 0.5, 1],
} as const;

interface TagStripProps {
  status: LinkStatus;
}

interface TagChipProps {
  tag: TagWithCount;
  active: boolean;
  suggested: boolean;
  onClick: () => void;
}

function TagChip({ tag, active, suggested, onClick }: TagChipProps) {
  const empty = !active && tag.count === 0;
  return (
    <Link
      to="."
      search={(prev: { tag?: string }) => ({
        ...prev,
        tag: active ? undefined : tag.id,
      })}
      onClick={onClick}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap transition-colors",
        active && "text-primary hover:text-primary",
        !active && !empty && "text-foreground/40 hover:text-foreground",
        empty && "text-foreground/20 hover:text-foreground/40"
      )}
    >
      {suggested && (
        <SparklesIcon aria-hidden="true" className="size-3 shrink-0" />
      )}
      <span>#{tag.name}</span>
      <span
        className={cn(
          "rounded px-1 text-[10px] leading-[1.4] tabular-nums transition-colors",
          active && "bg-primary/15 text-primary/70",
          !active && !empty && "bg-foreground/[0.06] text-foreground/50",
          empty && "bg-foreground/[0.03] text-foreground/25"
        )}
      >
        {tag.count}
      </span>
      {active && (
        <motion.span
          layoutId="tag-strip-underline"
          aria-hidden="true"
          className="absolute -bottom-1 left-0 right-0 h-px bg-primary"
          transition={underlineTransition}
        />
      )}
    </Link>
  );
}

export const TagStrip = memo(function TagStrip({ status }: TagStripProps) {
  const store = useAppStore();
  const tagsQuery = useMemo(() => tagsWithCountsForStatus$(status), [status]);
  const newSuggestionsQuery = useMemo(
    () => newTagSuggestionsWithCountsForStatus$(status),
    [status]
  );
  const existingTags = store.useQuery(tagsQuery);
  const newSuggestionTags = store.useQuery(newSuggestionsQuery);
  const { tag: selectedTag } = useTagFilter();
  const clearSelection = useSelectionStore((s) => s.clear);

  if (existingTags.length === 0 && newSuggestionTags.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 mb-2 flex w-full flex-nowrap items-center gap-x-[10px] overflow-x-auto px-2 text-xs font-medium [-ms-overflow-style:none] [scrollbar-width:none] lg:flex-wrap lg:gap-y-1.5 lg:overflow-x-visible [&::-webkit-scrollbar]:hidden">
      {existingTags.map((tag) => (
        <TagChip
          key={tag.id}
          tag={tag}
          active={selectedTag === tag.id}
          suggested={false}
          onClick={clearSelection}
        />
      ))}
      {newSuggestionTags.map((tag) => (
        <TagChip
          key={tag.id}
          tag={tag}
          active={selectedTag === tag.id}
          suggested
          onClick={clearSelection}
        />
      ))}
    </div>
  );
});
