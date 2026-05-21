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
import { useOrgFeatures } from "@/hooks/use-org-features";

import { KeyCreatedBanner } from "./key-created-banner";
import { KeyList } from "./key-list";
import { UpgradeCta } from "./upgrade-cta";
import type { ApiKey } from "./use-api-keys";

interface DevelopersCardProps {
  keys: ApiKey[];
  isLoading: boolean;
  isGenerating: boolean;
  onGenerateKey: (name: string) => Promise<string | null>;
  onRevokeKey: (keyId: string) => void;
}

export function DevelopersCard({
  keys,
  isLoading,
  isGenerating,
  onGenerateKey,
  onRevokeKey,
}: DevelopersCardProps) {
  const { capabilities } = useOrgFeatures();
  const [keyName, setKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const requiresUpgrade = !capabilities.publicApi;

  // Hide first-party integration keys from this list — they're managed
  // by their own integration cards above.
  const developerKeys = keys.filter(
    (k) =>
      k.name !== "Raycast Extension" &&
      !k.name?.startsWith("Raycast — ") &&
      k.name !== "Telegram"
  );

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
          Developers
        </CardTitle>
        <CardDescription>
          API keys for custom integrations and scripts.
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
