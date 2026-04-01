import { Loader2, RefreshCw, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSyncStatusStore } from "@/stores/sync-status-store";

export function SyncStatusIndicator() {
  const { status } = useSyncStatusStore();

  if (status.state === "connected") return null;
  if (status.state === "reconnecting") return <ReconnectingItem />;
  return <ErrorItem status={status} />;
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

function ErrorItem({
  status,
}: {
  status: { code: string; message: string };
}) {
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
    <StatusBadge
      icon={WifiOff}
      label={label}
      tooltip={status.message}
      color="destructive"
      action={{ onClick: handleAction }}
    />
  );
}
