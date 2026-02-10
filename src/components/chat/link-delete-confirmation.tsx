import { ExternalLink, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { linksByIds$, type LinkWithDetails } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";

interface LinkDeleteConfirmationProps {
  linkIds: string[];
  onApprove: () => void;
  onReject: () => void;
}

function LinkPreview({ link }: { link: LinkWithDetails | null }) {
  if (!link) {
    return (
      <div className="text-muted-foreground text-sm italic">Link not found</div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-1.5">
      {link.favicon ? (
        <img
          src={link.favicon}
          alt=""
          className="size-4 rounded-sm flex-shrink-0"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <ExternalLink className="size-4 text-muted-foreground flex-shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">
          {link.title || link.url}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {link.domain}
        </div>
      </div>
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
  const orderedLinks = linkIds.map((id) => linkMap.get(id) ?? null);
  const validLinks = links;
  const isBulk = linkIds.length > 1;

  return (
    <div className="border-destructive overflow-hidden rounded-md border">
      <div className="p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Trash2 className="size-4 text-destructive flex-shrink-0" />
          <span className="font-medium text-sm">
            {isBulk
              ? `Move ${validLinks.length} link${validLinks.length !== 1 ? "s" : ""} to trash?`
              : "Move to trash?"}
          </span>
        </div>

        <div className="space-y-0.5 max-h-32 overflow-y-auto">
          {orderedLinks.map((link, i) => (
            <LinkPreview key={linkIds[i]} link={link} />
          ))}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8"
            onClick={onReject}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="flex-1 h-8"
            onClick={onApprove}
          >
            <Trash2 className="size-3 mr-1" />
            Delete{isBulk ? ` ${validLinks.length}` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
