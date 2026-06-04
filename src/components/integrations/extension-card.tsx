import { ChevronDownIcon, ExternalLinkIcon, PuzzleIcon } from "lucide-react";

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
import { CHROME_WEB_STORE_URL } from "@/lib/extension-connect";

import { KeyList } from "./key-list";
import type { ApiKey } from "./use-api-keys";

interface ExtensionCardProps {
  keys: ApiKey[];
  isLoading: boolean;
  onRevokeKey: (keyId: string) => void;
}

export function ExtensionCard({
  keys,
  isLoading,
  onRevokeKey,
}: ExtensionCardProps) {
  const extensionKeys = keys.filter((k) => k.name === "Chrome Extension");
  const isConnected = extensionKeys.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PuzzleIcon className="size-3.5" />
          Chrome extension
        </CardTitle>
        <CardDescription>
          Save the page you’re on in one click, straight from the toolbar.
        </CardDescription>
        {isConnected && (
          <CardAction>
            <Badge variant="outline">
              Connected · {extensionKeys.length}{" "}
              {extensionKeys.length === 1 ? "browser" : "browsers"}
            </Badge>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {isConnected ? (
          <Collapsible>
            <CollapsibleTrigger className="group/disclosure flex w-full items-center justify-between rounded-md py-1 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30">
              <span>Manage browsers</span>
              <ChevronDownIcon className="size-3.5 transition-transform group-data-[panel-open]/disclosure:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <KeyList
                keys={extensionKeys}
                isLoading={isLoading}
                onRevoke={onRevokeKey}
              />
              <p className="mt-2 text-muted-foreground">
                Revoking a key signs that browser out. Reconnect from the
                extension popup.
              </p>
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>Install Cloudstash from the Chrome Web Store</li>
            <li>Pin it to your toolbar</li>
            <li>Open the popup and connect — that’s it!</li>
          </ol>
        )}

        <a
          href={CHROME_WEB_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          View in Chrome Web Store
          <ExternalLinkIcon className="size-3" aria-hidden />
        </a>
      </CardContent>
    </Card>
  );
}
