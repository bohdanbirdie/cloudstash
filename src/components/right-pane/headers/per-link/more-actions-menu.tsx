import { EllipsisVerticalIcon, RefreshCwIcon } from "lucide-react";
import { useMemo } from "react";

import { ACTION_META } from "@/components/right-pane/headers/page-actions";
import type { LinkAction } from "@/components/right-pane/headers/page-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { linkProcessingStatus$ } from "@/livestore/queries/links";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

export function MoreActionsMenu({
  linkId,
  isDeleted,
  onArchiveToggle,
}: {
  linkId: string;
  isDeleted: boolean;
  onArchiveToggle: () => void;
}) {
  const store = useAppStore();
  const processingQuery = useMemo(
    () => linkProcessingStatus$(linkId),
    [linkId]
  );
  const processingRecord = store.useQuery(processingQuery);
  const isProcessing = processingRecord?.status === "pending";
  const isReprocessing = processingRecord?.status === "reprocess-requested";

  const handleReprocess = () => {
    store.commit(
      events.linkReprocessRequested({
        linkId,
        requestedAt: new Date(),
      })
    );
  };

  const archiveAction: LinkAction = isDeleted ? "restore" : "archive";
  const archiveMeta = ACTION_META[archiveAction];
  const ArchiveActionIcon = archiveMeta.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="icon-sm" variant="ghost" aria-label="More actions">
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
        <DropdownMenuItem onClick={onArchiveToggle}>
          <ArchiveActionIcon className="size-4" />
          {archiveMeta.label}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
