import { RefreshCw, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { DotmSquare11 } from "@/components/ui/dotm-square-11";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSyncStatusStore } from "@/stores/sync-status-store";

export function SyncStatusIndicator() {
  const status = useSyncStatusStore((s) => s.status);

  return (
    <AnimatePresence mode="wait">
      {status.state === "reconnecting" && (
        <FadeWrap key="reconnecting">
          <ReconnectingBadge />
        </FadeWrap>
      )}
      {status.state === "error" && (
        <FadeWrap key="error">
          <ErrorBadge status={status} />
        </FadeWrap>
      )}
    </AnimatePresence>
  );
}

function FadeWrap({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="flex items-center"
    >
      {children}
    </motion.div>
  );
}

function ReconnectingBadge() {
  return (
    <Tooltip>
      <TooltipTrigger
        className="inline-flex size-7 items-center justify-center text-muted-foreground"
        render={<span aria-label="Reconnecting" />}
      >
        <DotmSquare11 size={14} dotSize={2} ariaLabel="Reconnecting" />
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        Reconnecting · changes saved locally
      </TooltipContent>
    </Tooltip>
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
    <div className="flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger
          className="inline-flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
          render={<span />}
        >
          <WifiOff className="size-3 shrink-0" />
          <span>{label}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">
          {status.message}
        </TooltipContent>
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
