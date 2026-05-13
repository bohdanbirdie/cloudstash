import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { memo, useMemo } from "react";

import { useTagFilter } from "@/hooks/use-tag-filter";
import { cn } from "@/lib/utils";
import type { LinkStatus } from "@/livestore/queries/filtered-links";
import { tagsWithCountsForStatus$ } from "@/livestore/queries/tags";
import { useAppStore } from "@/livestore/store";
import { useSelectionStore } from "@/stores/selection-store";

const underlineTransition = {
  duration: 0.18,
  ease: [0.25, 1, 0.5, 1],
} as const;

interface TagStripProps {
  status: LinkStatus;
}

export const TagStrip = memo(function TagStrip({ status }: TagStripProps) {
  const store = useAppStore();
  const query = useMemo(() => tagsWithCountsForStatus$(status), [status]);
  const tags = store.useQuery(query);
  const { tag: selectedTag } = useTagFilter();
  const clearSelection = useSelectionStore((s) => s.clear);

  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 mb-2 flex w-full flex-wrap items-baseline gap-x-[10px] gap-y-1.5 px-2 text-xs font-medium">
      {tags.map((tag) => {
        const active = selectedTag === tag.id;
        const empty = !active && tag.count === 0;
        return (
          <Link
            key={tag.id}
            to="."
            search={(prev: { tag?: string }) => ({
              ...prev,
              tag: active ? undefined : tag.id,
            })}
            onClick={clearSelection}
            className={cn(
              "relative cursor-pointer transition-colors",
              active && "text-primary hover:text-primary",
              !active && !empty && "text-foreground/40 hover:text-foreground",
              empty && "text-foreground/20 hover:text-foreground/40"
            )}
          >
            #{tag.name}
            <span
              className={cn(
                "ml-1 rounded px-1 text-[10px] leading-[1.4] tabular-nums transition-colors",
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
      })}
    </div>
  );
});
