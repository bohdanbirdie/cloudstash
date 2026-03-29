import { Loader2, RefreshCw, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { sendBroadcast, useSyncStatusStore } from "@/stores/sync-status-store";

export function SyncStatusIndicator() {
  const { status, storeId } = useSyncStatusStore();

  if (status.state === "connected") return null;
  if (status.state === "reconnecting") return <ReconnectingItem />;
  if (status.state === "waiting_for_focus")
    return <WaitingItem storeId={storeId} />;
  return <ErrorItem status={status} storeId={storeId} />;
}

function StatusBadge({
  icon: Icon,
  label,
  tooltip,
  color,
  spinning,
  action,
}: {
  icon: typeof WifiOff;
  label: string;
  tooltip: string;
  color: "amber" | "destructive";
  spinning?: boolean;
  action?: { onClick: () => void };
}) {
  const colorClasses =
    color === "amber"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "bg-destructive/10 text-destructive";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex items-center gap-1.5 pr-2 py-1 group-data-[collapsible=icon]:pr-0 group-data-[collapsible=icon]:justify-center">
          <Tooltip>
            <TooltipTrigger
              className={`inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${colorClasses}`}
              render={<div />}
            >
              <Icon
                className={`size-3.5 shrink-0 ${spinning ? "animate-spin" : ""}`}
              />
              <span className="group-data-[collapsible=icon]:hidden">
                {label}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="start">
              {tooltip}
            </TooltipContent>
          </Tooltip>
          {action && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Retry"
              className="size-6 shrink-0 group-data-[collapsible=icon]:hidden"
              onClick={action.onClick}
            >
              <RefreshCw className="size-3" />
            </Button>
          )}
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function ReconnectingItem() {
  return (
    <StatusBadge
      icon={Loader2}
      label="Reconnecting"
      tooltip="Your changes are saved locally."
      color="amber"
      spinning
    />
  );
}

function WaitingItem({ storeId }: { storeId: string | null }) {
  const handleRetry = () => {
    if (!storeId) return;
    sendBroadcast(`livestore.sync-retry.${storeId}`, { type: "reset" });
  };

  return (
    <StatusBadge
      icon={WifiOff}
      label="Offline"
      tooltip="Sync paused. Your changes are saved locally."
      color="destructive"
      action={{ onClick: handleRetry }}
    />
  );
}

function ErrorItem({
  status,
  storeId,
}: {
  status: { code: string; message: string };
  storeId: string | null;
}) {
  const handleAction = () => {
    if (status.code === "SESSION_EXPIRED") {
      window.location.href = "/login";
    } else if (storeId) {
      sendBroadcast(`livestore.sync-retry.${storeId}`, { type: "reset" });
    } else {
      window.location.reload();
    }
  };

  const label =
    status.code === "SESSION_EXPIRED" ? "Session expired" : "Sync error";

  return (
    <StatusBadge
      icon={WifiOff}
      label={label}
      tooltip={status.message}
      color="destructive"
      action={{ onClick: handleAction }}
    />
  );
}
