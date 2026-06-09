import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import type { TagWithCount } from "@/livestore/queries/schemas";

const underlineTransition = {
  duration: 0.18,
  ease: [0.25, 1, 0.5, 1],
} as const;

interface TagChipProps {
  tag: TagWithCount;
  active: boolean;
  tabbable: boolean;
  onClick: () => void;
}

export function TagChip({ tag, active, tabbable, onClick }: TagChipProps) {
  return (
    <Link
      to="."
      search={(prev: { tag?: string }) => ({
        ...prev,
        tag: active ? undefined : tag.id,
      })}
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      data-tag-item={tag.id}
      tabIndex={tabbable ? 0 : -1}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        {
          "text-primary hover:text-primary": active,
          "text-foreground/40 hover:text-foreground focus-visible:text-foreground":
            !active,
        }
      )}
    >
      <span>#{tag.name}</span>
      <span
        className={cn(
          "rounded px-1 text-[10px] leading-[1.4] tabular-nums transition-colors",
          {
            "bg-primary/15 text-primary/70": active,
            "bg-foreground/[0.06] text-foreground/50": !active,
          }
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
