import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgFeatures } from "@/hooks/use-org-features";

import { IntegrationItem } from "./integration-card";
import { RaycastLogo } from "./integration-icons";
import { KeyList } from "./key-list";
import { UpgradeCta } from "./upgrade-cta";
import type { ApiKey } from "./use-api-keys";

const RAYCAST_STORE_URL = "https://www.raycast.com/birdie/cloudstash";

interface RaycastCardProps {
  keys: ApiKey[];
  isLoading: boolean;
  onRevokeKey: (keyId: string) => Promise<boolean>;
}

export function RaycastCard({
  keys,
  isLoading,
  onRevokeKey,
}: RaycastCardProps) {
  const { capabilities } = useOrgFeatures();
  const raycastKeys = keys.filter(
    (key) =>
      key.name === "Raycast Extension" || key.name?.startsWith("Raycast — ")
  );
  const isConnected = raycastKeys.length > 0;
  const requiresUpgrade = !isConnected && !capabilities.integrations;
  const description = (() => {
    if (isLoading) {
      return <Skeleton className="h-3 w-44 motion-reduce:animate-none" />;
    }
    if (!isConnected) return "Save links with a keyboard shortcut";
    const noun = raycastKeys.length === 1 ? "device" : "devices";
    return `${raycastKeys.length} connected ${noun}`;
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
    if (requiresUpgrade) return <UpgradeCta compact tier="plus" />;
    return (
      <Button
        nativeButton={false}
        size="sm"
        render={
          <a href={RAYCAST_STORE_URL} target="_blank" rel="noopener noreferrer">
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
        icon={<RaycastLogo />}
        iconClassName="bg-[#FF6363]/10 text-[#FF6363]"
        title="Raycast"
      >
        {isConnected && (
          <CollapsibleContent className="mt-3 pl-10">
            <KeyList
              keys={raycastKeys}
              isLoading={false}
              onRevoke={onRevokeKey}
            />
          </CollapsibleContent>
        )}
      </IntegrationItem>
    </Collapsible>
  );
}
