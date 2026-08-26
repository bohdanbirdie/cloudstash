import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { CHROME_WEB_STORE_URL } from "@/lib/extension-connect";

import { IntegrationItem } from "./integration-card";
import { ChromeLogo } from "./integration-icons";
import { KeyList } from "./key-list";
import type { ApiKey } from "./use-api-keys";

interface ExtensionCardProps {
  keys: ApiKey[];
  isLoading: boolean;
  onRevokeKey: (keyId: string) => Promise<boolean>;
}

export function ExtensionCard({
  keys,
  isLoading,
  onRevokeKey,
}: ExtensionCardProps) {
  const extensionKeys = keys.filter((key) => key.name === "Chrome Extension");
  const isConnected = extensionKeys.length > 0;
  const description = (() => {
    if (isLoading) {
      return <Skeleton className="h-3 w-40 motion-reduce:animate-none" />;
    }
    if (!isConnected) return "Save pages from the Chrome toolbar";
    const noun = extensionKeys.length === 1 ? "browser" : "browsers";
    return `${extensionKeys.length} connected ${noun}`;
  })();
  const control = (() => {
    if (isLoading) {
      return <Skeleton className="h-6 w-20 motion-reduce:animate-none" />;
    }
    if (isConnected) {
      return (
        <CollapsibleTrigger className="group/disclosure inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30">
          Manage
          <ChevronDownIcon
            aria-hidden
            className="size-3 transition-transform group-data-[panel-open]/disclosure:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
      );
    }
    return (
      <Button
        nativeButton={false}
        size="sm"
        render={
          <a
            href={CHROME_WEB_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Install
            <ExternalLinkIcon />
          </a>
        }
      />
    );
  })();

  return (
    <Collapsible key={isConnected ? "connected" : "disconnected"}>
      <IntegrationItem
        control={control}
        description={description}
        icon={<ChromeLogo />}
        iconClassName="bg-[#4285F4]/10 text-[#4285F4]"
        title="Chrome"
      >
        {isConnected && (
          <CollapsibleContent className="mt-3 pl-10">
            <KeyList
              keys={extensionKeys}
              isLoading={false}
              onRevoke={onRevokeKey}
            />
          </CollapsibleContent>
        )}
      </IntegrationItem>
    </Collapsible>
  );
}
