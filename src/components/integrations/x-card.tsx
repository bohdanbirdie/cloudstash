import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useOrgFeatures } from "@/hooks/use-org-features";

import { DisconnectButton, IntegrationItem } from "./integration-card";
import { XLogo } from "./integration-icons";
import { UpgradeCta } from "./upgrade-cta";
import { useXStatus } from "./use-x-status";

function connectionMessage({
  needsReconnect,
  syncEnabled,
  xUsername,
}: {
  needsReconnect: boolean;
  syncEnabled: boolean;
  xUsername: string | null;
}) {
  const account = xUsername ? `@${xUsername} · ` : "";
  if (needsReconnect) return `${account}Reconnect to resume bookmark sync`;
  if (!syncEnabled) return `${account}New bookmark sync is paused`;
  return `${account}New bookmarks sync automatically`;
}

export function XCard() {
  const status = useXStatus();
  const { capabilities, isLoading: capsLoading } = useOrgFeatures();

  const needsReconnect = status.status === "needs_reconnect";
  const isLoadingInitial =
    (status.isLoading && status.status === null) || capsLoading;
  const requiresUpgrade = !status.isConnected && !capabilities.xBookmarkSync;

  const description = (() => {
    if (isLoadingInitial) {
      return <Skeleton className="h-3 w-48 motion-reduce:animate-none" />;
    }
    if (!status.isConnected) {
      return "Sync new bookmarks from X";
    }
    return connectionMessage({
      needsReconnect,
      syncEnabled: status.syncEnabled,
      xUsername: status.xUsername,
    });
  })();

  const actions = (() => {
    if (isLoadingInitial) {
      return <Skeleton className="h-6 w-20 motion-reduce:animate-none" />;
    }
    if (!status.isConnected) {
      if (requiresUpgrade) return <UpgradeCta compact tier="pro" />;
      return (
        <Button
          aria-label="Connect X"
          disabled={status.isMutating}
          onClick={() => void status.connect()}
          size="sm"
        >
          {status.mutatingAction === "connect" && (
            <Spinner
              aria-hidden
              className="size-3 motion-reduce:animate-none"
            />
          )}
          Connect
        </Button>
      );
    }
    return (
      <>
        {needsReconnect && (
          <Button
            disabled={status.isMutating}
            onClick={() => void status.connect()}
            size="sm"
          >
            Reconnect
          </Button>
        )}
        {!needsReconnect && !status.syncEnabled && (
          <Button
            disabled={status.isMutating}
            onClick={() => void status.resume()}
            size="sm"
            variant="outline"
          >
            {status.mutatingAction === "resume" ? "Resuming…" : "Resume"}
          </Button>
        )}
        <DisconnectButton
          disabled={status.isMutating}
          integration="X"
          isPending={status.mutatingAction === "disconnect"}
          onClick={() => void status.disconnect()}
        />
      </>
    );
  })();

  const controlState = (() => {
    if (isLoadingInitial) return "loading";
    if (!status.isConnected) {
      if (requiresUpgrade) return "upgrade";
      return "disconnected";
    }
    if (needsReconnect) return "reconnect";
    if (!status.syncEnabled) return "paused";
    return "connected";
  })();

  return (
    <IntegrationItem
      control={actions}
      controlKey={controlState}
      description={description}
      icon={<XLogo />}
      iconClassName="bg-foreground/5 text-foreground"
      title="X"
    >
      {status.error && (
        <p className="mt-2 pl-10 text-destructive" role="alert">
          {status.error}
        </p>
      )}
    </IntegrationItem>
  );
}
