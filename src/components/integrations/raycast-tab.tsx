import { CheckCircle2Icon, ExternalLinkIcon } from "lucide-react";

import { TabsContent } from "@/components/ui/tabs";

import { KeyList } from "./key-list";
import type { ApiKey } from "./use-api-keys";

interface RaycastTabProps {
  keys: ApiKey[];
  isLoading: boolean;
  onRevokeKey: (keyId: string) => void;
}

export function RaycastTab({ keys, isLoading, onRevokeKey }: RaycastTabProps) {
  const raycastKeys = keys.filter(
    (k) => k.name === "Raycast Extension" || k.name?.startsWith("Raycast — ")
  );
  const isConnected = raycastKeys.length > 0;

  return (
    <TabsContent value="raycast" className="space-y-4 mt-4">
      <p className="text-muted-foreground">
        Save links with a keyboard shortcut from anywhere on your Mac.
      </p>

      {isConnected && (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
            <CheckCircle2Icon className="h-4 w-4 shrink-0 text-emerald-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium tabular-nums">
                {raycastKeys.length === 1
                  ? "1 device connected"
                  : `${raycastKeys.length} devices connected`}
              </p>
            </div>
          </div>

          <KeyList
            keys={raycastKeys}
            isLoading={isLoading}
            onRevoke={onRevokeKey}
          />

          <p className="text-xs text-muted-foreground">
            Revoking a key disconnects that device. Reconnect by running any
            Cloudstash command in Raycast.
          </p>
        </>
      )}

      <div className="space-y-2 text-sm">
        <p className="font-medium">
          {isConnected ? "Add another device" : "Setup"}
        </p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>
            Install Cloudstash from the{" "}
            <a
              href="https://www.raycast.com/birdie/cloudstash"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-0.5"
            >
              Raycast Store
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          </li>
          <li>Run any Cloudstash command in Raycast</li>
          <li>Sign in when prompted — that&apos;s it!</li>
        </ol>
      </div>
    </TabsContent>
  );
}
