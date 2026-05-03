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
import { HotkeyButton } from "@/components/ui/hotkey-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

  return (
    <div className="flex h-full items-center justify-between gap-2 bg-background pt-3 pb-2 pr-2">
      {actions.inList && actions.listLength > 1 ? (
        <span className="text-xs text-muted-foreground tabular-nums">
          {actions.currentIndex + 1}/{actions.listLength}
        </span>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-1">
        <HotkeyButton
          size="sm"
          variant="ghost"
          onClick={onCompleteToggle}
          onHotkeyPress={onCompleteToggle}
          aria-label={completeMeta.label}
          hotkey="meta+enter"
          hotkeyEnabled={!hasSelection}
          scope="detail"
        >
          <IconSwap iconKey={completeAction}>
            <CompleteIcon />
          </IconSwap>
          <span>{completeMeta.label}</span>
        </HotkeyButton>

        <CopyUrlButton url={link.url} />

        <Tooltip>
          <TooltipTrigger
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
          <TooltipContent>Open in new tab</TooltipContent>
        </Tooltip>

        <ExportDialogButton ids={[link.id]} pageTitle={displayTitle(link)} />

        <MoreActionsMenu
          linkId={link.id}
          isDeleted={isDeleted}
          onArchiveToggle={onArchiveToggle}
        />
      </div>
    </div>
  );
}
