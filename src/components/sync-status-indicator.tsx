import { Loader2, RefreshCw, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { sendBroadcast, useSyncStatusStore } from "@/stores/sync-status-store";

export function SyncStatusIndicator() {
  const { status, storeId } = useSyncStatusStore();

  if (status.state === "connected") return null;
  if (status.state === "reconnecting") return <ReconnectingBadge />;
  if (status.state === "waiting_for_focus")
    return <WaitingBadge storeId={storeId} />;
  return <ErrorBadge status={status} />;
}

function ReconnectingBadge() {
  return (
    <div className="flex items-center gap-1.5 px-2">
      <Tooltip>
        <TooltipTrigger
          className="inline-flex w-fit items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400"
          render={<div />}
        >
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          <span className="group-data-[collapsible=icon]:hidden">
            Reconnecting
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">
          Your changes are saved locally.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function WaitingBadge({ storeId }: { storeId: string | null }) {
  const handleRetry = () => {
    if (!storeId) return;
    sendBroadcast(`livestore.sync-retry.${storeId}`, { type: "reset" });
  };

  return (
    <div className="flex items-center gap-1.5 px-2">
      <Tooltip>
        <TooltipTrigger
          className="inline-flex w-fit items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive"
          render={<div />}
        >
          <WifiOff className="size-3.5 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">Offline</span>
        </TooltipTrigger>
        <TooltipContent side="right">
          Sync paused. Your changes are saved locally.
        </TooltipContent>
      </Tooltip>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Retry"
        className="size-6 shrink-0"
        onClick={handleRetry}
      >
        <RefreshCw className="size-3" />
      </Button>
    </div>
  );
}

function ErrorBadge({ status }: { status: { code: string; message: string } }) {
  const handleAction = () => {
    if (status.code === "SESSION_EXPIRED") {
      window.location.href = "/login";
    } else {
      window.location.reload();
    }
  };

  const label =
    status.code === "SESSION_EXPIRED" ? "Session expired" : "Sync error";

  return (
    <div className="flex items-center gap-1.5 px-2">
      <Tooltip>
        <TooltipTrigger
          className="inline-flex w-fit items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive"
          render={<div />}
        >
          <WifiOff className="size-3.5 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">{label}</span>
        </TooltipTrigger>
        <TooltipContent side="right">{status.message}</TooltipContent>
      </Tooltip>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Retry"
        className="size-6 shrink-0"
        onClick={handleAction}
      >
        <RefreshCw className="size-3" />
      </Button>
    </div>
  );
}
