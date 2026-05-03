import { Loader2, RefreshCw, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSyncStatusStore } from "@/stores/sync-status-store";

export function SyncStatusIndicator() {
  const status = useSyncStatusStore((s) => s.status);

  if (status.state === "connected") {
    return <ConnectedBadge />;
  }
  if (status.state === "reconnecting") {
    return <ReconnectingBadge />;
  }
  return <ErrorBadge status={status} />;
}

function ConnectedBadge() {
  return (
    <Tooltip>
      <TooltipTrigger
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums"
        render={<span />}
      >
        <span
          className="inline-block size-1.5 rounded-full bg-primary"
          aria-hidden="true"
        />
        <span>synced</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        Connected
      </TooltipContent>
    </Tooltip>
  );
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
    <div className="flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${colorClasses}`}
          render={<span />}
        >
          <Icon
            className={`size-3 shrink-0 ${spinning ? "animate-spin" : ""}`}
          />
          <span>{label}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">
          {tooltip}
        </TooltipContent>
      </Tooltip>
      {action && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Retry"
          className="size-6 shrink-0"
          onClick={action.onClick}
        >
          <RefreshCw className="size-3" />
        </Button>
      )}
    </div>
  );
}

function ReconnectingBadge() {
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
    <StatusBadge
      icon={WifiOff}
      label={label}
      tooltip={status.message}
      color="destructive"
      action={{ onClick: handleAction }}
    />
  );
}
