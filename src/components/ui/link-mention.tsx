import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { useCallback, useState } from "react";

import { Favicon } from "@/components/favicon";
import { LinkImage } from "@/components/link-image";
import { displayDescription, displayTitle } from "@/lib/link-display";
import { linkByUrl$ } from "@/livestore/queries/links";
import type { LinkWithDetails } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";
import { useRightPaneStore } from "@/stores/right-pane-store";

const LINK_PILL_CLASS =
  "inline-flex items-baseline gap-1 rounded-sm border border-border bg-muted px-1.5 py-0.5 text-xs leading-tight font-medium text-foreground no-underline hover:bg-primary hover:border-primary hover:text-primary-foreground transition-colors";

const PillContent = ({
  link,
  displayText,
}: {
  link: LinkWithDetails;
  displayText: string;
}) => (
  <>
    <Favicon src={link.favicon} className="size-3.5 self-center rounded-sm" />
    <span className="max-w-[200px] truncate leading-tight">{displayText}</span>
  </>
);

interface LinkMentionWithTooltipProps {
  link: LinkWithDetails;
  href: string;
  displayText: string;
  onOpenDetail: () => void;
}

function LinkMentionWithTooltip({
  link,
  href,
  displayText,
  onOpenDetail,
}: LinkMentionWithTooltipProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const handlePopupClick = () => {
    close();
    onOpenDetail();
  };

  return (
    <TooltipPrimitive.Provider delay={150}>
      <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
        <TooltipPrimitive.Trigger
          render={(triggerProps) => (
            <a
              {...triggerProps}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                triggerProps.onClick?.(e);
                close();
              }}
              className={LINK_PILL_CLASS}
            >
              <PillContent link={link} displayText={displayText} />
            </a>
          )}
        />
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner
            side="top"
            sideOffset={6}
            className="z-[60]"
          >
            <TooltipPrimitive.Popup
              className="z-50 overflow-hidden max-w-xs bg-background border border-primary shadow-xl animate-in fade-in-0 zoom-in-95 cursor-pointer hover:border-primary/80"
              onClick={handlePopupClick}
            >
              <LinkImage
                src={link.image}
                alt={link.title ? displayTitle(link) : ""}
                iconClassName="h-6 w-6"
              />
              <div className="p-2">
                {link.title && (
                  <p className="font-medium text-sm text-foreground line-clamp-2">
                    {displayTitle(link)}
                  </p>
                )}
                {displayDescription(link) && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {displayDescription(link)}
                  </p>
                )}
              </div>
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
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
        <LinkMentionWithTooltip
          link={link}
          href={href}
          displayText={displayText}
          onOpenDetail={handleOpenDetail}
        />
      );
    }

    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_PILL_CLASS}
      >
        <PillContent link={link} displayText={displayText} />
      </a>
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
