import { ApiReferenceCard } from "@/components/integrations/api-reference-card";
import { DevelopersCard } from "@/components/integrations/developers-card";
import type { ApiKey } from "@/components/integrations/use-api-keys";
import { useApiKeys } from "@/components/integrations/use-api-keys";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useOrgFeatures } from "@/hooks/use-org-features";

export function DevelopersSection() {
  const apiKeys = useApiKeys(true);
  const { capabilities } = useOrgFeatures();

  return (
    <DevelopersSectionView
      error={apiKeys.error}
      isGenerating={apiKeys.isGenerating}
      isLoading={apiKeys.isLoading}
      keys={apiKeys.keys}
      onGenerateKey={apiKeys.generateKey}
      onRevokeKey={apiKeys.revokeKey}
      publicApiAvailable={capabilities.publicApi}
    />
  );
}

interface DevelopersSectionViewProps {
  error: string | null;
  isGenerating: boolean;
  isLoading: boolean;
  keys: ApiKey[];
  onGenerateKey: (name: string) => Promise<string | null>;
  onRevokeKey: (keyId: string) => Promise<boolean>;
  publicApiAvailable: boolean;
}

export function DevelopersSectionView({
  error,
  isGenerating,
  isLoading,
  keys,
  onGenerateKey,
  onRevokeKey,
  publicApiAvailable,
}: DevelopersSectionViewProps) {
  return (
    <div className="flex flex-1 flex-col min-h-0 gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DevelopersCard
        keys={keys}
        isLoading={isLoading}
        isGenerating={isGenerating}
        publicApiAvailable={publicApiAvailable}
        onGenerateKey={onGenerateKey}
        onRevokeKey={onRevokeKey}
      />

      <ApiReferenceCard />
    </div>
  );
}
