import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import { useCallback, useState } from "react";

import { Favicon } from "@/components/favicon";
import { LinkImage } from "@/components/link-image";
import { displayDescription, displayTitle } from "@/lib/link-display";
import { linkByUrl$ } from "@/livestore/queries/links";
import type { LinkWithDetails } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";
import { useRightPaneStore } from "@/stores/right-pane-store";

const LINK_PILL_CLASS =
  "group inline-flex cursor-pointer items-baseline gap-1 rounded-sm border border-border bg-muted px-1.5 py-0.5 text-xs leading-tight font-medium text-foreground no-underline transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground";

const PillContent = ({
  link,
  displayText,
}: {
  link: LinkWithDetails;
  displayText: string;
}) => (
  <>
    <Favicon
      src={link.favicon}
      className="size-3.5 self-center rounded-sm transition-colors group-hover:text-primary-foreground"
    />
    <span className="max-w-[200px] truncate leading-tight">{displayText}</span>
  </>
);

interface LinkMentionWithPreviewProps {
  link: LinkWithDetails;
  displayText: string;
  onOpenDetail: () => void;
}

function LinkMentionWithPreview({
  link,
  displayText,
  onOpenDetail,
}: LinkMentionWithPreviewProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const handlePopupClick = () => {
    close();
    onOpenDetail();
  };

  return (
    <PreviewCardPrimitive.Root open={open} onOpenChange={setOpen}>
      <PreviewCardPrimitive.Trigger
        delay={150}
        closeDelay={100}
        render={<button type="button" />}
        aria-label={`Open ${displayText} in your library`}
        onClick={(event) => {
          event.preventBaseUIHandler();
          close();
          onOpenDetail();
        }}
        className={LINK_PILL_CLASS}
      >
        <PillContent link={link} displayText={displayText} />
      </PreviewCardPrimitive.Trigger>
      <PreviewCardPrimitive.Portal>
        <PreviewCardPrimitive.Positioner
          side="top"
          sideOffset={6}
          className="z-[60]"
        >
          <PreviewCardPrimitive.Popup className="z-50 w-80 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-border bg-popover ring-1 ring-transparent outline-hidden animate-in fade-in-0 zoom-in-95 transition-[border-color,box-shadow] duration-150 hover:border-primary/60 hover:ring-primary/45">
            <button
              type="button"
              aria-label={`Open ${displayTitle(link)} in your library`}
              onClick={handlePopupClick}
              className="block w-full cursor-pointer overflow-hidden rounded-[calc(var(--radius-lg)-1px)] text-start outline-hidden transition-colors duration-150 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <LinkImage
                src={link.image}
                alt={link.title ? displayTitle(link) : ""}
                iconClassName="h-6 w-6"
              />
              <div className="p-2.5">
                {link.title && (
                  <p className="line-clamp-2 text-sm font-medium text-foreground">
                    {displayTitle(link)}
                  </p>
                )}
                {displayDescription(link) && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {displayDescription(link)}
                  </p>
                )}
              </div>
            </button>
          </PreviewCardPrimitive.Popup>
        </PreviewCardPrimitive.Positioner>
      </PreviewCardPrimitive.Portal>
    </PreviewCardPrimitive.Root>
  );
}

interface LinkMentionProps {
  href: string;
  children: React.ReactNode;
}

export function LinkMention({ href, children }: LinkMentionProps) {
  const store = useAppStore();
  const link = store.useQuery(linkByUrl$(href));
  const openDetail = useRightPaneStore((s) => s.openDetail);

  const childText = typeof children === "string" ? children : null;
  const isPlainUrl = childText === href;

  if (link && isPlainUrl) {
    const displayText = link.title ? displayTitle(link) : link.domain;
    const hasPreview = link.image || link.title;

    const handleOpenDetail = () => {
      openDetail(link.id);
    };

    if (hasPreview) {
      return (
        <LinkMentionWithPreview
          link={link}
          displayText={displayText}
          onOpenDetail={handleOpenDetail}
        />
      );
    }

    return (
      <button
        type="button"
        aria-label={`Open ${displayText} in your library`}
        onClick={handleOpenDetail}
        className={LINK_PILL_CLASS}
      >
        <PillContent link={link} displayText={displayText} />
      </button>
    );
  }

  return (
    <a
      href={href}
      className="text-primary underline underline-offset-2 break-all hover:text-primary/80"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}
