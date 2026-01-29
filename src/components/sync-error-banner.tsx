import { AlertTriangle, LogOut, RefreshCw, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSyncStatusStore } from "@/stores/sync-status-store";

const ERROR_TITLES: Record<string, string> = {
  ACCESS_DENIED: "Access Denied",
  SESSION_EXPIRED: "Session Expired",
  UNAPPROVED: "Account Pending Approval",
  UNKNOWN: "Offline",
};

export function SyncErrorBanner() {
  const { error, clearError } = useSyncStatusStore();

  if (!error) {
    return null;
  }

  const title = ERROR_TITLES[error.code] || "Sync Error";
  const showLogout = error.code === "SESSION_EXPIRED";
  const isOffline = error.code === "UNKNOWN";

  return (
    <div className={`border-b px-4 py-3 ${isOffline ? "bg-muted/50 border-border" : "bg-destructive/15 border-destructive/20"}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {isOffline ? (
            <WifiOff className="h-5 w-5 text-muted-foreground" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          )}
          <div>
            <p className={`text-sm font-medium ${isOffline ? "text-foreground" : "text-destructive"}`}>
              {title}
            </p>
            <p className="text-sm text-muted-foreground">{error.message}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {showLogout ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                clearError();
                window.location.href = "/login";
              }}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign In
            </Button>
          ) : !isOffline ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                clearError();
                window.location.reload();
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reload
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
