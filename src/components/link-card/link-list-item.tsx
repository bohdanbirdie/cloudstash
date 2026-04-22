import { memo } from "react";

import { TagBadge } from "@/components/tags/tag-badge";
import { BorderTrail } from "@/components/ui/border-trail";
import type { LinkListItem as LinkListItemData } from "@/livestore/queries/links";
import type { Tag } from "@/livestore/queries/tags";

interface LinkListItemProps {
  link: LinkListItemData;
  tags: readonly Tag[];
  processingStatus: string | null;
  formattedDate: string;
  onClick: (e: React.MouseEvent) => void;
}

function LinkListItemImpl({
  link,
  tags,
  processingStatus,
  formattedDate,
  onClick,
}: LinkListItemProps) {
  const isProcessing = processingStatus === "pending";
  const displayTitle = link.title || link.url;

  return (
    <button
      type="button"
      data-id={link.id}
      onClick={onClick}
      className="relative flex w-full flex-col gap-1 ring-1 ring-foreground/10 bg-card p-3 text-left transition-all [content-visibility:auto] [contain-intrinsic-size:100px] hover:bg-muted/50 hover:ring-foreground/40"
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
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium truncate flex-1 w-0">{displayTitle}</p>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          {link.favicon && (
            <img
              src={link.favicon}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-4 w-4"
            />
          )}
          {link.domain}
        </span>
      </div>
      {link.description && (
        <p className="text-sm text-muted-foreground truncate w-0 min-w-full">
          {link.description}
        </p>
      )}
      <div className="flex items-center gap-2">
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <TagBadge key={tag.id} name={tag.name} />
            ))}
          </div>
        )}
        <span className="text-xs text-muted-foreground ml-auto shrink-0">
          {formattedDate}
        </span>
      </div>
    </button>
  );
}

export const LinkListItem = memo(LinkListItemImpl, (prev, next) => {
  const prevLink = prev.link;
  const nextLink = next.link;
  const linkEqual =
    prevLink === nextLink ||
    (prevLink.id === nextLink.id &&
      prevLink.createdAt === nextLink.createdAt &&
      prevLink.completedAt === nextLink.completedAt &&
      prevLink.deletedAt === nextLink.deletedAt &&
      prevLink.status === nextLink.status &&
      prevLink.title === nextLink.title &&
      prevLink.description === nextLink.description &&
      prevLink.favicon === nextLink.favicon &&
      prevLink.domain === nextLink.domain &&
      prevLink.url === nextLink.url);
  return (
    linkEqual &&
    prev.tags === next.tags &&
    prev.processingStatus === next.processingStatus &&
    prev.formattedDate === next.formattedDate &&
    prev.onClick === next.onClick
  );
});
