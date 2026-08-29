import { Match } from "effect";
import { ArchiveIcon, ChevronDownIcon, ExternalLinkIcon } from "lucide-react";
import { useId, useState } from "react";

import { Favicon } from "@/components/favicon";
import { Button } from "@/components/ui/button";
import { displayTitle } from "@/lib/link-display";
import { cn } from "@/lib/utils";
import { linksByIds$ } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";

interface LinkDeleteConfirmationProps {
  linkIds: string[];
  onApprove: () => void;
  onReject: () => void;
}

export interface ArchiveLinkPreview {
  id: string;
  title: string;
  domain: string;
  favicon: string | null;
}

function LinkPreview({ link }: { link: ArchiveLinkPreview }) {
  return (
    <div className="flex min-h-8 items-center gap-2 px-2 py-1.5">
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
    />
  );
}

export function LinkDeleteConfirmationView({
  links,
  onApprove,
  onReject,
}: {
  links: readonly (ArchiveLinkPreview | null)[];
  onApprove: () => void;
  onReject: () => void;
}) {
  const listId = useId();
  const [showAll, setShowAll] = useState(false);
  const availableLinks = links.filter(
    (link): link is ArchiveLinkPreview => link !== null
  );
  const validLinkCount = availableLinks.length;
  const canExpand = validLinkCount > 3;
  const visibleLinks = Match.value(showAll).pipe(
    Match.when(true, () => availableLinks),
    Match.orElse(() => availableLinks.slice(0, 3))
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
    Match.orElse(() => `Show all ${validLinkCount} links`)
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-background">
      <div className="p-3">
        <div className="flex items-center gap-2">
          <ArchiveIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="text-sm font-medium tabular-nums">{title}</span>
        </div>

        {validLinkCount > 0 && (
          <div
            id={listId}
            className={cn(
              "mt-2 divide-y divide-border/60 overflow-hidden rounded-md bg-muted/40",
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
            className="mt-1 h-7 w-full justify-between px-2 text-muted-foreground"
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

        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 flex-1"
            onClick={onReject}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-7 flex-1"
            onClick={onApprove}
            disabled={validLinkCount === 0}
          >
            <ArchiveIcon aria-hidden="true" className="mr-1 size-3" />
            Move to archive
          </Button>
        </div>
      </div>
    </div>
  );
}
