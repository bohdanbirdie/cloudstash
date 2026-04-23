import { memo } from "react";

import { TagBadge } from "@/components/tags/tag-badge";
import { BorderTrail } from "@/components/ui/border-trail";
import { cn } from "@/lib/utils";
import type { LinkListItem as LinkListItemData } from "@/livestore/queries/links";
import type { Tag } from "@/livestore/queries/tags";

interface LinkListItemProps {
  link: LinkListItemData;
  tags: readonly Tag[];
  processingStatus: string | null;
  formattedDate: string;
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
}

function LinkListItemImpl({
  link,
  tags,
  processingStatus,
  formattedDate,
  active,
  onClick,
}: LinkListItemProps) {
  const isProcessing = processingStatus === "pending";
  const displayTitle = link.title || link.url;
  const monogram = link.domain?.charAt(0) ?? "";

  return (
    <button
      type="button"
      data-id={link.id}
      onClick={onClick}
      className={cn(
        "group relative -mx-3 grid w-[calc(100%+1.5rem)] cursor-default grid-cols-[1fr_5rem] items-start gap-x-5 rounded-md px-3 py-2 text-left [content-visibility:auto] [contain-intrinsic-size:7rem] transition-colors hover:bg-muted",
        active && "bg-border hover:bg-border"
      )}
    >
      {isProcessing && (
        <BorderTrail
          className="bg-gradient-to-l from-blue-200 via-blue-500 to-blue-200 dark:from-blue-400 dark:via-blue-500 dark:to-blue-700"
          size={80}
          transition={{
            duration: 4,
            ease: "linear",
            repeat: Infinity,
          }}
        />
      )}

      <div className="flex min-w-0 flex-col">
        <div className="truncate text-base font-semibold leading-snug tracking-tight text-foreground text-pretty">
          {displayTitle}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {link.domain}
        </div>
        {link.description && (
          <div className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground text-pretty">
            {link.description}
          </div>
        )}
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {tags.map((tag) => (
              <TagBadge key={tag.id} name={tag.name} />
            ))}
          </div>
          <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
            {formattedDate}
          </span>
        </div>
      </div>

      <div className="mt-0.5 aspect-[16/9] overflow-hidden rounded-sm outline outline-black/10 -outline-offset-1 dark:outline-white/10">
        {link.image ? (
          <img
            src={link.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="block size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-muted text-lg font-semibold uppercase leading-none text-muted-foreground">
            {monogram}
          </div>
        )}
      </div>
    </button>
  );
}

export const LinkListItem = memo(
  LinkListItemImpl,
  (prev, next) =>
    prev.link === next.link &&
    prev.tags === next.tags &&
    prev.processingStatus === next.processingStatus &&
    prev.formattedDate === next.formattedDate &&
    prev.active === next.active &&
    prev.onClick === next.onClick
);
