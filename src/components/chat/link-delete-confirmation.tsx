import { Match } from "effect";
import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react";
import { useId, useState } from "react";

import { Favicon } from "@/components/favicon";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { KeyChord } from "@/components/ui/key-chord";
import { displayTitle } from "@/lib/link-display";
import { cn } from "@/lib/utils";
import { linksByIds$ } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";

interface LinkDeleteConfirmationProps {
  linkIds: string[];
  onApprove: () => void;
  onReject: () => void;
  surface?: "card" | "composer";
}

export interface ArchiveLinkPreview {
  id: string;
  title: string;
  domain: string;
  favicon: string | null;
}

function LinkPreview({ link }: { link: ArchiveLinkPreview }) {
  return (
    <div className="flex min-h-7 items-center gap-2 px-2 py-1">
      {link.favicon ? (
        <Favicon src={link.favicon} className="size-3.5 shrink-0 rounded-sm" />
      ) : (
        <ExternalLinkIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      )}
      <span className="min-w-0 flex-1 truncate text-xs/4 font-medium">
        {link.title}
      </span>
      <span className="max-w-[40%] shrink-0 truncate text-[0.6875rem]/3.5 text-muted-foreground">
        {link.domain}
      </span>
    </div>
  );
}

export function LinkDeleteConfirmation({
  linkIds,
  onApprove,
  onReject,
  surface = "card",
}: LinkDeleteConfirmationProps) {
  const store = useAppStore();
  const links = store.useQuery(linksByIds$(linkIds));

  const linkMap = new Map(links.map((l) => [l.id, l]));
  const orderedLinks = linkIds.map((id) =>
    Match.value(linkMap.get(id)).pipe(
      Match.when(Match.undefined, () => null),
      Match.orElse((link) => ({
        id: link.id,
        title: displayTitle(link),
        domain: link.domain,
        favicon: link.favicon,
      }))
    )
  );

  return (
    <LinkDeleteConfirmationView
      links={orderedLinks}
      onApprove={onApprove}
      onReject={onReject}
      surface={surface}
    />
  );
}

export function LinkDeleteConfirmationView({
  links,
  onApprove,
  onReject,
  surface = "card",
  defaultExpanded = false,
}: {
  links: readonly (ArchiveLinkPreview | null)[];
  onApprove: () => void;
  onReject: () => void;
  surface?: "card" | "composer";
  defaultExpanded?: boolean;
}) {
  const listId = useId();
  const [showAll, setShowAll] = useState(defaultExpanded);
  const availableLinks = links.filter(
    (link): link is ArchiveLinkPreview => link !== null
  );
  const validLinkCount = availableLinks.length;
  const canExpand = validLinkCount > 2;
  const visibleLinks = Match.value(showAll).pipe(
    Match.when(true, () => availableLinks),
    Match.orElse(() => availableLinks.slice(0, 2))
  );
  const title = Match.value(validLinkCount).pipe(
    Match.when(0, () => "Links no longer available"),
    Match.when(
      (count) => count > 1,
      (count) => `Move ${count} links to archive?`
    ),
    Match.orElse(() => "Move to archive?")
  );
  const disclosureLabel = Match.value(showAll).pipe(
    Match.when(true, () => "Show fewer links"),
    Match.orElse(() => `Review all ${validLinkCount} links`)
  );
  const isComposer = surface === "composer";

  return (
    <div
      className={cn("overflow-hidden", {
        "rounded-lg border border-border/70 bg-background": !isComposer,
      })}
    >
      <div className={cn({ "p-3": !isComposer, "p-2": isComposer })}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 text-sm font-medium tabular-nums">
            {title}
          </span>
          <div className="ms-auto flex shrink-0 gap-1.5">
            <Button
              type="button"
              data-approval-action="reject"
              variant="outline"
              size="sm"
              aria-keyshortcuts={isComposer ? "Escape" : undefined}
              onClick={onReject}
            >
              Keep
              {isComposer && (
                <Kbd aria-hidden="true" className="ms-1 h-4 min-w-4">
                  Esc
                </Kbd>
              )}
            </Button>
            <Button
              type="button"
              data-approval-action="approve"
              size="sm"
              aria-keyshortcuts={
                isComposer ? "Meta+Enter Control+Enter" : undefined
              }
              onClick={onApprove}
              disabled={validLinkCount === 0}
            >
              Archive
              {isComposer && (
                <Kbd
                  aria-hidden="true"
                  className="ms-1 h-4 min-w-4 bg-primary-foreground/15 text-primary-foreground"
                >
                  <KeyChord keys={["cmd", "enter"]} />
                </Kbd>
              )}
            </Button>
          </div>
        </div>

        {validLinkCount > 0 && (
          <div
            id={listId}
            className={cn(
              "mt-1.5 divide-y divide-border/60 overflow-hidden rounded-md bg-muted/40",
              {
                "scroll-fade-y max-h-44 overflow-y-auto overscroll-contain":
                  showAll,
              }
            )}
          >
            {visibleLinks.map((link) => (
              <LinkPreview key={link.id} link={link} />
            ))}
          </div>
        )}

        {canExpand && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={showAll}
            aria-controls={listId}
            className="mt-1 h-6 w-full justify-between px-2 text-muted-foreground"
            onClick={() => setShowAll((current) => !current)}
          >
            <span>{disclosureLabel}</span>
            <ChevronDownIcon
              aria-hidden="true"
              className={cn(
                "transition-transform duration-150 motion-reduce:transition-none",
                {
                  "rotate-180": showAll,
                }
              )}
            />
          </Button>
        )}
      </div>
    </div>
  );
}
