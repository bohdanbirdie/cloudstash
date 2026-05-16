import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { useXStatus } from "./use-x-status";

function formatRelative(ts: number | null): string {
  if (!ts) return "never";
  const diffMs = Date.now() - ts;
  if (diffMs < 60_000) return "just now";
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function XCard() {
  const status = useXStatus();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDisconnect = async () => {
    const ok = await status.disconnect();
    if (ok) setConfirmOpen(false);
  };

  const needsReconnect = status.status === "needs_reconnect";
  const isLoadingInitial = status.isLoading && status.status === null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <img
            src="/favicons/x.png"
            alt=""
            width={14}
            height={14}
            className="size-3.5 dark:invert"
          />
          <span>X</span>
        </CardTitle>
        <CardDescription>
          Sync your X bookmarks into Cloudstash automatically.
        </CardDescription>
        {status.isConnected && (
          <CardAction>
            <Badge
              variant={needsReconnect ? "destructive" : "outline"}
              aria-label={`X integration status: ${
                needsReconnect
                  ? "reconnect needed"
                  : status.syncEnabled
                    ? "connected"
                    : "paused"
              }`}
            >
              {needsReconnect
                ? "Reconnect needed"
                : status.syncEnabled
                  ? "Connected"
                  : "Paused"}
            </Badge>
          </CardAction>
        )}
      </CardHeader>

      {/* min-h on the content reserves the height of the connected layout
          (2 paragraphs + button row) so the skeleton → loaded transition
          doesn't shift the surrounding integrations grid. */}
      <CardContent className="min-h-[7.5rem] space-y-3">
        {isLoadingInitial ? (
          <>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-9 w-28" />
            </div>
          </>
        ) : status.isConnected ? (
          <>
            <p className="text-muted-foreground">
              {status.xUsername ? `@${status.xUsername} · ` : ""}
              {needsReconnect
                ? "Your X session expired — reconnect to resume."
                : status.syncEnabled
                  ? `Last synced ${formatRelative(status.lastSyncedAt)}.`
                  : "Sync is paused. Resume to start polling again."}
            </p>
            <div className="flex flex-wrap gap-2">
              {needsReconnect ? (
                <Button
                  size="sm"
                  onClick={() => void status.connect()}
                  disabled={status.isMutating}
                >
                  Reconnect
                </Button>
              ) : status.syncEnabled ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void status.pause()}
                  disabled={status.isMutating}
                >
                  {status.mutatingAction === "pause"
                    ? "Pausing…"
                    : "Pause sync"}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void status.resume()}
                  disabled={status.isMutating}
                >
                  {status.mutatingAction === "resume"
                    ? "Resuming…"
                    : "Resume sync"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={status.isMutating}
                className="ml-auto"
              >
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              Authorize Cloudstash to read your bookmarks. New bookmarks appear
              in your vault within ~30 seconds.
            </p>
            <p className="text-muted-foreground text-xs">
              Only new bookmarks are synced — your existing ones stay on X.
            </p>
            <Button
              onClick={() => void status.connect()}
              disabled={status.isMutating}
            >
              {status.mutatingAction === "connect" ? "Opening X…" : "Connect X"}
            </Button>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect X?</AlertDialogTitle>
            <AlertDialogDescription>
              We'll stop syncing new bookmarks and revoke our access. Existing
              bookmarks in your vault stay. You can reconnect anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={status.isMutating}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDisconnect();
              }}
              disabled={status.isMutating}
            >
              {status.mutatingAction === "disconnect"
                ? "Disconnecting…"
                : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
