import { ChevronDownIcon, CommandIcon, ExternalLinkIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
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

import { KeyList } from "./key-list";
import type { ApiKey } from "./use-api-keys";

interface RaycastCardProps {
  keys: ApiKey[];
  isLoading: boolean;
  onRevokeKey: (keyId: string) => void;
}

export function RaycastCard({
  keys,
  isLoading,
  onRevokeKey,
}: RaycastCardProps) {
  const raycastKeys = keys.filter(
    (k) => k.name === "Raycast Extension" || k.name?.startsWith("Raycast — ")
  );
  const isConnected = raycastKeys.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CommandIcon className="size-3.5" />
          Raycast
        </CardTitle>
        <CardDescription>
          Save links with a keyboard shortcut from anywhere on your Mac.
        </CardDescription>
        {isConnected && (
          <CardAction>
            <Badge variant="outline">
              Connected · {raycastKeys.length}{" "}
              {raycastKeys.length === 1 ? "device" : "devices"}
            </Badge>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {isConnected ? (
          <Collapsible>
            <CollapsibleTrigger className="group/disclosure flex w-full items-center justify-between rounded-md py-1 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30">
              <span>Manage devices</span>
              <ChevronDownIcon className="size-3.5 transition-transform group-data-[panel-open]/disclosure:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <KeyList
                keys={raycastKeys}
                isLoading={isLoading}
                onRevoke={onRevokeKey}
              />
              <p className="mt-2 text-muted-foreground">
                Revoking a key disconnects that device. Reconnect by running any
                Cloudstash command in Raycast.
              </p>
            </CollapsibleContent>
          </Collapsible>
        ) : (
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
                <ExternalLinkIcon className="size-3" />
              </a>
            </li>
            <li>Run any Cloudstash command in Raycast</li>
            <li>Sign in when prompted — that&apos;s it!</li>
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
