import { ApiReferenceCard } from "@/components/integrations/api-reference-card";
import { DevelopersCard } from "@/components/integrations/developers-card";
import { useApiKeys } from "@/components/integrations/use-api-keys";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function DevelopersSection() {
  const apiKeys = useApiKeys(true);

  return (
    <div className="flex flex-1 flex-col min-h-0 gap-4">
      {apiKeys.error && (
        <Alert variant="destructive">
          <AlertDescription>{apiKeys.error}</AlertDescription>
        </Alert>
      )}

      <DevelopersCard
        keys={apiKeys.keys}
        isLoading={apiKeys.isLoading}
        isGenerating={apiKeys.isGenerating}
        onGenerateKey={apiKeys.generateKey}
        onRevokeKey={apiKeys.revokeKey}
      />

      <ApiReferenceCard />
    </div>
  );
}
