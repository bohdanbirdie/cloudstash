import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";

import { KeyCreatedBanner } from "./key-created-banner";
import { KeyList } from "./key-list";
import { type ApiKey } from "./use-api-keys";

interface ApiKeysTabProps {
  keys: ApiKey[];
  isLoading: boolean;
  isGenerating: boolean;
  generatedKey: string | null;
  onGenerateKey: (name: string) => Promise<string | null>;
  onRevokeKey: (keyId: string) => void;
  onClearGeneratedKey: () => void;
}

export function ApiKeysTab({
  keys,
  isLoading,
  isGenerating,
  generatedKey,
  onGenerateKey,
  onRevokeKey,
  onClearGeneratedKey,
}: ApiKeysTabProps) {
  const [keyName, setKeyName] = useState("");

  const handleGenerate = async () => {
    await onGenerateKey(keyName || "API Key");
    setKeyName("");
  };

  return (
    <TabsContent value="api-keys" className="space-y-4 mt-4">
      <p className="text-muted-foreground">
        API keys for custom integrations and third-party apps.
      </p>

      {generatedKey && (
        <KeyCreatedBanner
          generatedKey={generatedKey}
          onDone={onClearGeneratedKey}
        />
      )}

      {!generatedKey && (
        <div className="border-t pt-4 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Key name (e.g., My App)"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleGenerate} disabled={isGenerating}>
              <PlusIcon className="h-4 w-4 mr-1" />
              {isGenerating ? "Generating..." : "Generate"}
            </Button>
          </div>
        </div>
      )}

      <div className="border-t pt-4">
        <p className="text-sm font-medium mb-2">Your API Keys</p>
        <KeyList keys={keys} isLoading={isLoading} onRevoke={onRevokeKey} />
      </div>
    </TabsContent>
  );
}
