import { KeyIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { KeyCreatedBanner } from "./key-created-banner";
import { KeyList } from "./key-list";
import { UpgradeCta } from "./upgrade-cta";
import { isIntegrationKey } from "./use-api-keys";
import type { ApiKey } from "./use-api-keys";

interface DevelopersCardProps {
  keys: ApiKey[];
  isLoading: boolean;
  isGenerating: boolean;
  publicApiAvailable: boolean;
  onGenerateKey: (name: string) => Promise<string | null>;
  onRevokeKey: (keyId: string) => Promise<boolean>;
}

export function DevelopersCard({
  keys,
  isLoading,
  isGenerating,
  publicApiAvailable,
  onGenerateKey,
  onRevokeKey,
}: DevelopersCardProps) {
  const [keyName, setKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const requiresUpgrade = !publicApiAvailable;

  // Hide first-party integration keys from this list — they're managed
  // by their own integration cards above.
  const developerKeys = keys.filter((k) => !isIntegrationKey(k));

  const handleGenerate = async () => {
    const key = await onGenerateKey(keyName || "API Key");
    if (key) {
      setGeneratedKey(key);
      setKeyName("");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyIcon className="size-3.5" />
          API keys
        </CardTitle>
        <CardDescription>
          Keys for custom integrations, scripts, and agents.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {generatedKey ? (
          <KeyCreatedBanner
            generatedKey={generatedKey}
            onDone={() => setGeneratedKey(null)}
          />
        ) : requiresUpgrade ? (
          <UpgradeCta tier="plus" />
        ) : (
          <div className="flex gap-2">
            <Input
              placeholder="Key name (e.g., My script)"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleGenerate} disabled={isGenerating}>
              <PlusIcon />
              {isGenerating ? "Generating…" : "Generate"}
            </Button>
          </div>
        )}

        <KeyList
          keys={developerKeys}
          isLoading={isLoading}
          onRevoke={onRevokeKey}
        />
      </CardContent>
    </Card>
  );
}
