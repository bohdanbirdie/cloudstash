import { CheckIcon } from "lucide-react";
import { memo } from "react";

import { LinkPreviewImage } from "@/components/link-preview-image";
import { TagBadge } from "@/components/tags/tag-badge";
import { BorderTrail } from "@/components/ui/border-trail";
import { displayDescription, displayTitle } from "@/lib/link-display";
import { stripMarkdown } from "@/lib/strip-markdown";
import { formatAgo } from "@/lib/time-ago";
import { cn } from "@/lib/utils";
import type { LinkListItem as LinkListItemData } from "@/livestore/queries/links";
import type { Tag } from "@/livestore/queries/tags";

interface LinkListItemProps {
  link: LinkListItemData;
  tags: readonly Tag[];
  processingStatus: string | null;
  active: boolean;
  selected: boolean;
  previewing: boolean;
  tabbable: boolean;
  onClick: (e: React.MouseEvent) => void;
  onMouseEnter: (e: React.MouseEvent) => void;
  onCheckboxClick: (id: string) => void;
}

function LinkListItemImpl({
  link,
  tags,
  processingStatus,
  active,
  selected,
  previewing,
  tabbable,
  onClick,
  onMouseEnter,
  onCheckboxClick,
}: LinkListItemProps) {
  const isProcessing = processingStatus === "pending";
  const titleText = displayTitle(link);
  const descriptionText = displayDescription(link);
  const formattedDate = formatAgo(link.createdAt);
  const showCheckbox = selected || previewing;

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-id={link.id}
      tabIndex={tabbable ? 0 : -1}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "group relative -mx-3 grid w-[calc(100%+1.5rem)] cursor-default grid-cols-[1fr_4.75rem] items-start rounded-md px-2 py-2 text-left outline-none [content-visibility:auto] [contain-intrinsic-size:7rem] transition-colors hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:ring-inset",
        showCheckbox ? "gap-x-2" : "gap-x-8",
        active && "bg-muted"
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

      <div className="flex min-w-0 items-start gap-2">
        {showCheckbox && (
          <span
            aria-hidden="true"
            onClick={(e) => {
              e.stopPropagation();
              onCheckboxClick(link.id);
            }}
            className={cn(
              "group/check mt-1 flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full",
              previewing
                ? "bg-muted-foreground/50"
                : "bg-primary group-hover/check:bg-muted-foreground/50"
            )}
          >
            <CheckIcon
              className={cn(
                "size-3",
                previewing
                  ? "text-background"
                  : "text-primary-foreground group-hover/check:text-background"
              )}
              strokeWidth={3}
            />
          </span>
        )}

        <div className="flex min-w-0 flex-col">
          <div className="truncate text-base font-semibold leading-snug tracking-tight text-foreground text-pretty">
            {titleText}
          </div>
          <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5 overflow-hidden text-xs text-muted-foreground">
            <span className="truncate">{link.domain}</span>
            <span aria-hidden="true" className="shrink-0">
              ·
            </span>
            <span className="shrink-0 tabular-nums">{formattedDate}</span>
            {tags.length > 0 && (
              <>
                <span aria-hidden="true" className="shrink-0">
                  ·
                </span>
                <div className="flex shrink-0 items-baseline gap-3">
                  {tags.slice(0, 2).map((tag) => (
                    <TagBadge key={tag.id} name={tag.name} />
                  ))}
                  {tags.length > 2 && (
                    <span className="tabular-nums">
                      +{tags.length - 2} more
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
          {descriptionText && (
            <div className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground text-pretty">
              {stripMarkdown(descriptionText)}
            </div>
          )}
        </div>
      </div>

      <div className="mt-0.5 aspect-[16/9] overflow-hidden rounded-sm">
        <LinkPreviewImage src={link.image} />
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
    prev.active === next.active &&
    prev.selected === next.selected &&
    prev.previewing === next.previewing &&
    prev.tabbable === next.tabbable &&
    prev.onClick === next.onClick &&
    prev.onMouseEnter === next.onMouseEnter &&
    prev.onCheckboxClick === next.onCheckboxClick
);
