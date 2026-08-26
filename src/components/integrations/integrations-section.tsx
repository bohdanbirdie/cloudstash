import { Alert, AlertDescription } from "@/components/ui/alert";

import { ExtensionCard } from "./extension-card";
import { McpCard } from "./mcp-card";
import { RaycastCard } from "./raycast-card";
import { TelegramCard } from "./telegram-card";
import { useApiKeys } from "./use-api-keys";
import { XCard } from "./x-card";

export function IntegrationsSection() {
  const apiKeys = useApiKeys(true);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {apiKeys.error && (
        <Alert variant="destructive">
          <AlertDescription>{apiKeys.error}</AlertDescription>
        </Alert>
      )}

      <div className="divide-y divide-border overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
        <TelegramCard />
        <XCard />
        <McpCard />
        <ExtensionCard
          keys={apiKeys.keys}
          isLoading={apiKeys.isLoading}
          onRevokeKey={apiKeys.revokeKey}
        />
        <RaycastCard
          keys={apiKeys.keys}
          isLoading={apiKeys.isLoading}
          onRevokeKey={apiKeys.revokeKey}
        />
      </div>
    </div>
  );
}
