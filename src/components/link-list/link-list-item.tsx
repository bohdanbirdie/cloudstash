import { memo } from "react";

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
  const monogram = link.domain?.charAt(0) ?? "";

  return (
    <button
      type="button"
      data-id={link.id}
      onClick={onClick}
      className="group relative grid w-full grid-cols-[1fr_5rem] items-start gap-x-5 rounded-md text-left [content-visibility:auto] [contain-intrinsic-size:6rem] transition-colors hover:bg-muted/40"
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
          <div className="min-w-0 truncate text-xs font-medium text-muted-foreground/70">
            {tags.map((tag, i) => (
              <span key={tag.id} className={i > 0 ? "ml-2" : undefined}>
                #{tag.name}
              </span>
            ))}
          </div>
          <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
            {formattedDate}
          </span>
        </div>
      </div>

      <div className="mt-0.5 aspect-[16/9]">
        {link.image ? (
          <img
            src={link.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="block size-full rounded-sm object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
          />
        ) : (
          <div className="flex size-full items-center justify-center rounded-sm bg-muted text-lg font-semibold uppercase leading-none text-muted-foreground">
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
    prev.onClick === next.onClick
);
