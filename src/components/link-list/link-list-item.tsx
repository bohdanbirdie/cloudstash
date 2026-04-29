import { CheckIcon, CircleIcon } from "lucide-react";
import { memo } from "react";

import { LinkPreviewImage } from "@/components/link-preview-image";
import { TagBadge } from "@/components/tags/tag-badge";
import { BorderTrail } from "@/components/ui/border-trail";
import { cn } from "@/lib/utils";
import type { LinkListItem as LinkListItemData } from "@/livestore/queries/links";
import type { Tag } from "@/livestore/queries/tags";
import { useIsSelected } from "@/stores/selection-store";

interface LinkListItemProps {
  link: LinkListItemData;
  tags: readonly Tag[];
  processingStatus: string | null;
  formattedDate: string;
  active: boolean;
  tabbable: boolean;
  onClick: (e: React.MouseEvent) => void;
}

function LinkListItemImpl({
  link,
  tags,
  processingStatus,
  formattedDate,
  active,
  tabbable,
  onClick,
}: LinkListItemProps) {
  const isSelected = useIsSelected(link.id);
  const isProcessing = processingStatus === "pending";
  const displayTitle = link.title || link.url;

  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      data-id={link.id}
      tabIndex={tabbable ? 0 : -1}
      onClick={onClick}
      className={cn(
        "group relative -mx-3 grid w-[calc(100%+1.5rem)] cursor-default grid-cols-[1fr_5rem] items-start gap-x-5 rounded-md px-2 py-2 text-left outline-none [content-visibility:auto] [contain-intrinsic-size:7rem] transition-colors hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:ring-inset",
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
        <div
          aria-hidden="true"
          className="mt-1 hidden group-data-[modifier-held]/list:block group-data-[selection-mode]/list:block"
        >
          {isSelected ? (
            <div className="flex size-4 items-center justify-center rounded-full bg-primary">
              <CheckIcon
                className="size-3 text-primary-foreground"
                strokeWidth={3}
              />
            </div>
          ) : (
            <div className="relative size-4">
              <CircleIcon className="absolute inset-0 size-4 text-muted-foreground/40 group-data-[modifier-held]/list:group-hover:opacity-0" />
              <div className="absolute inset-0 flex size-4 items-center justify-center rounded-full bg-muted-foreground/50 opacity-0 group-data-[modifier-held]/list:group-hover:opacity-100">
                <CheckIcon
                  className="size-3 text-background"
                  strokeWidth={3}
                />
              </div>
            </div>
          )}
        </div>

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
    prev.formattedDate === next.formattedDate &&
    prev.active === next.active &&
    prev.tabbable === next.tabbable &&
    prev.onClick === next.onClick
);
