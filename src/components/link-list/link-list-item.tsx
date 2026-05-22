import { CheckIcon, ExternalLinkIcon } from "lucide-react";
import { memo } from "react";

import { Favicon } from "@/components/favicon";
import { LinkPreviewImage } from "@/components/link-preview-image";
import { displayTitle } from "@/lib/link-display";
import { cn } from "@/lib/utils";
import type { LinkListItem as LinkListItemData } from "@/livestore/queries/links";
import type { Tag } from "@/livestore/queries/tags";

interface LinkListItemProps {
  link: LinkListItemData;
  tags: readonly Tag[];
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
  active,
  selected,
  previewing,
  tabbable,
  onClick,
  onMouseEnter,
  onCheckboxClick,
}: LinkListItemProps) {
  const titleText = displayTitle(link);
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
        "group relative -mx-1 grid w-[calc(100%+0.5rem)] cursor-default grid-cols-[1fr_4.75rem] items-start rounded-md px-2 py-2 text-left outline-none transition-colors lg:-mx-3 lg:w-[calc(100%+1.5rem)] mouse:hover:[&:not(:has([data-domain-link]:hover))]:bg-muted focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:ring-inset",
        showCheckbox ? "gap-x-2" : "gap-x-8",
        active && "bg-muted"
      )}
    >
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

        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="line-clamp-2 text-base font-medium leading-snug text-foreground text-pretty">
            {titleText}
          </div>
          <div className="flex min-w-0 items-center gap-3 overflow-hidden text-xs text-muted-foreground">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              tabIndex={-1}
              data-domain-link
              onClick={(e) => e.stopPropagation()}
              className="group/domain -my-1 -mx-1 flex min-w-0 cursor-pointer items-center rounded-sm px-1 py-1 transition-colors"
            >
              <Favicon
                src={link.favicon}
                className="mr-1.5 size-3 shrink-0 rounded-[2px]"
              />
              <span className="truncate font-medium text-foreground/80 group-hover/domain:text-foreground group-hover/domain:underline group-hover/domain:decoration-1 group-hover/domain:underline-offset-2">
                {link.domain}
              </span>
              <ExternalLinkIcon
                aria-hidden="true"
                className="ml-1.5 hidden size-3 shrink-0 group-hover:inline-flex"
              />
            </a>
            {tags.length > 0 && (
              <div className="flex shrink-0 items-center gap-2.5">
                {tags.slice(0, 2).map((tag) => (
                  <span key={tag.id} className="whitespace-nowrap">
                    <span className="text-muted-foreground/50">#</span>
                    {tag.name}
                  </span>
                ))}
                {tags.length > 2 && (
                  <span className="text-muted-foreground/55">
                    +{tags.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="aspect-[16/9] overflow-hidden rounded-sm">
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
    prev.active === next.active &&
    prev.selected === next.selected &&
    prev.previewing === next.previewing &&
    prev.tabbable === next.tabbable &&
    prev.onClick === next.onClick &&
    prev.onMouseEnter === next.onMouseEnter &&
    prev.onCheckboxClick === next.onCheckboxClick
);
