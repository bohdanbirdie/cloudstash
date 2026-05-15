import { ChevronDownIcon, KeyIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";

import { KeyCreatedBanner } from "./key-created-banner";
import { KeyList } from "./key-list";
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
  const [keyName, setKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

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
      <Collapsible>
        <CollapsibleTrigger
          render={
            <CardHeader className="group/disclosure cursor-pointer rounded-t-lg outline-none transition-colors hover:bg-foreground/[0.02] focus-visible:bg-foreground/[0.02] focus-visible:ring-2 focus-visible:ring-ring/30">
              <CardTitle className="flex items-center gap-2">
                <KeyIcon className="size-3.5" />
                Developers
                <ChevronDownIcon className="ml-auto size-3.5 text-muted-foreground transition-transform group-data-[panel-open]/disclosure:rotate-180" />
              </CardTitle>
              <CardDescription>
                API keys for custom integrations and scripts.
              </CardDescription>
            </CardHeader>
          }
        />
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-1">
            {generatedKey ? (
              <KeyCreatedBanner
                generatedKey={generatedKey}
                onDone={() => setGeneratedKey(null)}
              />
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
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
