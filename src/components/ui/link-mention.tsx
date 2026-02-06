import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { useChatContainer } from "@/components/chat/chat-sheet";
import { LinkImage } from "@/components/link-card/link-image";
import { useLinkDetailDialog } from "@/components/link-detail-dialog";
import { linkByUrl$, type LinkWithDetails } from "@/livestore/queries";
import { useAppStore } from "@/livestore/store";

interface LinkMentionWithTooltipProps {
  link: LinkWithDetails;
  linkElement: React.ReactElement;
  onOpenDetail: () => void;
}

function LinkMentionWithTooltip({
  link,
  linkElement,
  onOpenDetail,
}: LinkMentionWithTooltipProps) {
  const chatContainer = useChatContainer();

  return (
    <TooltipPrimitive.Provider delay={400}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger render={linkElement} />
        <TooltipPrimitive.Portal container={chatContainer?.current}>
          <TooltipPrimitive.Positioner side="top" sideOffset={6}>
            <TooltipPrimitive.Popup
              className="z-50 overflow-hidden max-w-xs bg-background border border-primary shadow-xl animate-in fade-in-0 zoom-in-95 cursor-pointer hover:border-primary/80"
              onClick={onOpenDetail}
            >
              <LinkImage
                src={link.image}
                alt={link.title ?? ""}
                iconClassName="h-6 w-6"
              />
              <div className="p-2">
                {link.title && (
                  <p className="font-medium text-sm text-foreground line-clamp-2">
                    {link.title}
                  </p>
                )}
                {link.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {link.description}
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
  const { open: openLinkDialog } = useLinkDetailDialog();

  const childText = typeof children === "string" ? children : null;
  const isPlainUrl = childText === href;

  if (link && isPlainUrl) {
    const displayText = link.title || link.domain;
    const hasPreview = link.image || link.title;

    const handleOpenDetail = () => {
      openLinkDialog({ linkId: link.id });
    };

    const linkElement = (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted px-1.5 py-0.5 text-xs leading-none font-medium text-foreground no-underline hover:bg-primary hover:border-primary hover:text-primary-foreground transition-colors align-text-bottom"
      >
        {link.favicon && (
          <img src={link.favicon} alt="" className="size-3.5 rounded-sm" />
        )}
        <span className="max-w-[200px] truncate">{displayText}</span>
      </a>
    );

    return hasPreview ? (
      <LinkMentionWithTooltip
        link={link}
        linkElement={linkElement}
        onOpenDetail={handleOpenDetail}
      />
    ) : (
      linkElement
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
