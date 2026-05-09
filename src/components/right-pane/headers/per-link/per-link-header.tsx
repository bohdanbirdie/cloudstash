import { ExternalLinkIcon } from "lucide-react";
import { useMemo } from "react";

import { ExportDialogButton } from "@/components/right-pane/headers/export-dialog-button";
import { IconSwap } from "@/components/right-pane/headers/icon-swap";
import { ACTION_META } from "@/components/right-pane/headers/page-actions";
import type { LinkAction } from "@/components/right-pane/headers/page-actions";
import { CopyUrlButton } from "@/components/right-pane/headers/per-link/copy-url-button";
import { MoreActionsMenu } from "@/components/right-pane/headers/per-link/more-actions-menu";
import { useLinkActions } from "@/components/right-pane/headers/per-link/use-link-actions";
import { Button } from "@/components/ui/button";
import {
  SharedTooltipProvider,
  SharedTooltipTrigger,
} from "@/components/ui/shared-tooltip";
import { useCommand } from "@/lib/keyboard";
import { displayTitle } from "@/lib/link-display";
import { linkById$ } from "@/livestore/queries/links";
import type { LinkWithDetails } from "@/livestore/queries/schemas";
import { useAppStore } from "@/livestore/store";
import { useInSelectionMode } from "@/stores/selection-store";

export function PerLinkHeader({ linkId }: { linkId: string }) {
  const store = useAppStore();
  const linkQuery = useMemo(() => linkById$(linkId), [linkId]);
  const link = store.useQuery(linkQuery);

  if (!link) return null;
  return <Loaded link={link} />;
}

function Loaded({ link }: { link: LinkWithDetails }) {
  const hasSelection = useInSelectionMode();
  const actions = useLinkActions(link);

  const isCompleted = link.status === "completed";
  const isDeleted = link.deletedAt !== null;

  const completeAction: LinkAction = isCompleted ? "uncomplete" : "complete";
  const completeMeta = ACTION_META[completeAction];
  const CompleteIcon = completeMeta.icon;
  const onCompleteToggle = isCompleted
    ? actions.handleUncomplete
    : actions.handleComplete;
  const onArchiveToggle = isDeleted
    ? actions.handleRestore
    : actions.handleDelete;

  useCommand("detailComplete", onCompleteToggle, !hasSelection);

  return (
    <div className="flex h-full items-center justify-between gap-2 bg-background pt-1.5 pb-2 px-3">
      {actions.inList && actions.listLength > 1 ? (
        <span className="text-xs text-muted-foreground tabular-nums">
          {actions.currentIndex + 1}/{actions.listLength}
        </span>
      ) : (
        <span />
      )}

      <SharedTooltipProvider>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onCompleteToggle}
            aria-label={completeMeta.label}
          >
            <IconSwap iconKey={completeAction}>
              <CompleteIcon />
            </IconSwap>
            <span>{completeMeta.label}</span>
          </Button>

          <CopyUrlButton url={link.url} />

          <SharedTooltipTrigger
            payload="Open in new tab"
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                nativeButton={false}
                render={
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open in new tab"
                  />
                }
              >
                <ExternalLinkIcon />
              </Button>
            }
          />

          <ExportDialogButton ids={[link.id]} pageTitle={displayTitle(link)} />

          <MoreActionsMenu
            linkId={link.id}
            isDeleted={isDeleted}
            onArchiveToggle={onArchiveToggle}
          />
        </div>
      </SharedTooltipProvider>
    </div>
  );
}
