import { CommandIcon, ExternalLinkIcon } from "lucide-react";

import { TabsContent } from "@/components/ui/tabs";

import { KeyList } from "./key-list";
import type { ApiKey } from "./use-api-keys";

interface RaycastTabProps {
  keys: ApiKey[];
  isLoading: boolean;
  onRevokeKey: (keyId: string) => void;
}

export function RaycastTab({ keys, isLoading, onRevokeKey }: RaycastTabProps) {
  const raycastKeys = keys.filter((k) => k.name === "Raycast Extension");

  return (
    <TabsContent value="raycast" className="space-y-4 mt-4">
      <p className="text-muted-foreground">
        Save links with a keyboard shortcut from anywhere on your Mac.
      </p>

      <div className="space-y-2 text-sm">
        <p className="font-medium">Setup Instructions:</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>
            Install Cloudstash from the{" "}
            <a
              href="https://www.raycast.com/store"
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-0.5"
            >
              Raycast Store
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          </li>
          <li>Run any Cloudstash command in Raycast</li>
          <li>Sign in when prompted — that&apos;s it!</li>
        </ol>
      </div>

      {raycastKeys.length > 0 && (
        <div className="border-t pt-4">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <CommandIcon className="h-3.5 w-3.5" />
            Connected Raycast Extension
          </div>
          <KeyList
            keys={raycastKeys}
            isLoading={isLoading}
            onRevoke={onRevokeKey}
          />
        </div>
      )}
    </TabsContent>
  );
}
