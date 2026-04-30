import {
  CheckCheck,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Trash2Icon,
  UndoIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { ExportDialog } from "@/components/export-dialog";
import {
  useRightPaneActions,
  useRightPaneState,
} from "@/components/right-pane-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HotkeyButton } from "@/components/ui/hotkey-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTrackLinkOpen } from "@/hooks/use-track-link-open";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";
import type { LinkAction } from "@/lib/link-projections";
import { cn } from "@/lib/utils";
import {
  inboxLinks$,
  linkById$,
  linkProcessingStatus$,
} from "@/livestore/queries/links";
import type { LinkListItem } from "@/livestore/queries/links";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";
import { useInSelectionMode } from "@/stores/selection-store";

export function PerLinkHeader({ linkId }: { linkId: string }) {
  const store = useAppStore();
  const trackLinkOpen = useTrackLinkOpen();
  const { projection } = useRightPaneState();
  const { closeDetail, navigate } = useRightPaneActions();
  const hasSelection = useInSelectionMode();

  const deferredLinkId = useDeferredValue(linkId);
  const linkQuery = useMemo(() => linkById$(deferredLinkId), [deferredLinkId]);
  const link = store.useQuery(linkQuery);

  const listQueryResult = store.useQuery(projection?.query ?? inboxLinks$);
  const links: readonly LinkListItem[] = projection ? listQueryResult : [];

  const processingRecord = store.useQuery(
    linkProcessingStatus$(deferredLinkId)
  );
  const isProcessing = processingRecord?.status === "pending";
  const isReprocessing = processingRecord?.status === "reprocess-requested";

  const [copied, setCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeoutId = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeoutId);
  }, [copied]);

  if (!link) return null;

  const currentIndex = links.findIndex((l) => l.id === link.id);
  const isCompleted = link.status === "completed";
  const isDeleted = link.deletedAt !== null;
  const displayTitle = link.title ? decodeHtmlEntities(link.title) : link.url;

  const getNextLinkId = (): string | null => {
    const nextLink = links[currentIndex + 1] ?? links[currentIndex - 1];
    return nextLink?.id ?? null;
  };

  const handleAction = (action: LinkAction, commitFn: () => void) => {
    const willRemove = projection?.willActionRemoveLink(action) ?? true;
    const nextLinkId = willRemove ? getNextLinkId() : link.id;

    commitFn();

    if (nextLinkId && nextLinkId !== link.id) {
      trackLinkOpen(nextLinkId);
      navigate(nextLinkId);
    } else if (willRemove) {
      closeDetail();
    }
  };

  const handleComplete = () =>
    handleAction("complete", () => {
      store.commit(
        events.linkCompleted({ completedAt: new Date(), id: link.id })
      );
    });

  const handleUncomplete = () =>
    handleAction("uncomplete", () => {
      store.commit(events.linkUncompleted({ id: link.id }));
    });

  const handleDelete = () =>
    handleAction("delete", () => {
      store.commit(events.linkDeleted({ deletedAt: new Date(), id: link.id }));
    });

  const handleRestore = () =>
    handleAction("restore", () => {
      store.commit(events.linkRestored({ id: link.id }));
    });

  const handleReprocess = () => {
    store.commit(
      events.linkReprocessRequested({
        linkId: link.id,
        requestedAt: new Date(),
      })
    );
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
  };

  return (
    <>
      <div className="flex h-full items-center justify-between gap-2 bg-background pt-3 pb-2 pr-2">
        {links.length > 1 ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {currentIndex + 1}/{links.length}
          </span>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-1">
          <HotkeyButton
            size="sm"
            variant="ghost"
            onClick={isCompleted ? handleUncomplete : handleComplete}
            onHotkeyPress={isCompleted ? handleUncomplete : handleComplete}
            aria-label={isCompleted ? "Mark as unread" : "Mark as complete"}
            hotkey="meta+enter"
            hotkeyEnabled={!hasSelection}
            scope="detail"
          >
            <IconSwap iconKey={isCompleted ? "undo" : "check"}>
              {isCompleted ? <UndoIcon /> : <CheckIcon />}
            </IconSwap>
            <span>{isCompleted ? "Reopen" : "Complete"}</span>
          </HotkeyButton>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={handleCopy}
                  aria-label="Copy URL"
                >
                  <IconSwap iconKey={copied ? "copied" : "copy"}>
                    {copied ? (
                      <CheckCheck className="text-green-500" />
                    ) : (
                      <CopyIcon />
                    )}
                  </IconSwap>
                </Button>
              }
            />
            <TooltipContent>{copied ? "Copied" : "Copy URL"}</TooltipContent>
          </Tooltip>

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

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setExportOpen(true)}
                  aria-label="Export"
                >
                  <DownloadIcon />
                </Button>
              }
            />
            <TooltipContent>Export</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="More actions"
                >
                  <EllipsisVerticalIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleReprocess}
                disabled={isProcessing || isReprocessing}
              >
                <RefreshCwIcon
                  className={cn(
                    "size-4",
                    (isProcessing || isReprocessing) && "animate-spin"
                  )}
                />
                Reprocess
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={isDeleted ? handleRestore : handleDelete}
                className={
                  isDeleted
                    ? undefined
                    : "text-destructive focus:text-destructive"
                }
              >
                {isDeleted ? (
                  <RotateCcwIcon className="size-4" />
                ) : (
                  <Trash2Icon className="size-4" />
                )}
                {isDeleted ? "Restore" : "Delete"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {exportOpen && (
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          links={[link]}
          pageTitle={displayTitle}
        />
      )}
    </>
  );
}

function IconSwap({
  iconKey,
  children,
}: {
  iconKey: string;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={iconKey}
        initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
        transition={{ type: "spring", duration: 0.3, bounce: 0 }}
        className="inline-flex"
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}
