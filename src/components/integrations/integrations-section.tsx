import { Alert, AlertDescription } from "@/components/ui/alert";

import { ExtensionCard } from "./extension-card";
import { RaycastCard } from "./raycast-card";
import { TelegramCard } from "./telegram-card";
import { useApiKeys } from "./use-api-keys";
import { XCard } from "./x-card";

export function IntegrationsSection() {
  const apiKeys = useApiKeys(true);

  return (
    <div className="flex flex-1 flex-col min-h-0 gap-4">
      {apiKeys.error && (
        <Alert variant="destructive">
          <AlertDescription>{apiKeys.error}</AlertDescription>
        </Alert>
      )}

      <XCard />

      <TelegramCard />

      <RaycastCard
        keys={apiKeys.keys}
        isLoading={apiKeys.isLoading}
        onRevokeKey={apiKeys.revokeKey}
      />

      <ExtensionCard
        keys={apiKeys.keys}
        isLoading={apiKeys.isLoading}
        onRevokeKey={apiKeys.revokeKey}
      />
    </div>
  );
}
