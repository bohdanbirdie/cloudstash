import { memo } from "react";

import { TagBadge } from "@/components/tags/tag-badge";
import { BorderTrail } from "@/components/ui/border-trail";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import type { LinkListItem } from "@/livestore/queries/links";
import type { Tag } from "@/livestore/queries/tags";

import { LinkImage } from "./link-image";

interface LinkCardProps {
  link: LinkListItem;
  tags: readonly Tag[];
  processingStatus: string | null;
  formattedDate: string;
  onClick: (e: React.MouseEvent) => void;
}

function LinkCardImpl({
  link,
  tags,
  processingStatus,
  formattedDate,
  onClick,
}: LinkCardProps) {
  const isProcessing = processingStatus === "pending";
  const displayTitle = link.title || link.url;

  return (
    <button
      type="button"
      data-id={link.id}
      onClick={onClick}
      className="block w-full text-left relative transition-all [content-visibility:auto] [contain-intrinsic-size:360px] [&_[data-slot=card]]:hover:bg-muted/50 [&_[data-slot=card]]:hover:ring-foreground/40"
    >
      <Card className="transition-shadow overflow-hidden h-full pt-0">
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
        <LinkImage src={link.image} />
        <CardHeader>
          <div className="flex items-center gap-2">
            {link.favicon && (
              <img
                src={link.favicon}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-4 w-4 shrink-0"
              />
            )}
            <span className="text-muted-foreground text-xs truncate">
              {link.domain}
            </span>
          </div>
          <CardTitle className="line-clamp-2">{displayTitle}</CardTitle>
          {link.description && (
            <CardDescription className="line-clamp-2">
              {link.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <TagBadge key={tag.id} name={tag.name} />
              ))}
            </div>
          )}
          <span className="text-muted-foreground text-xs">{formattedDate}</span>
        </CardContent>
      </Card>
    </button>
  );
}

export const LinkCard = memo(LinkCardImpl, (prev, next) => {
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
      prevLink.image === nextLink.image &&
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
