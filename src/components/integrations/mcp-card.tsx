import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgFeatures } from "@/hooks/use-org-features";

import { IntegrationItem } from "./integration-card";
import { McpLogo } from "./integration-icons";
import { mcpAvailabilityState, mcpEndpoint } from "./mcp-connection";
import { McpSetup } from "./mcp-setup";
import { UpgradeCta } from "./upgrade-cta";

export function McpCard() {
  const {
    capabilities,
    error,
    isFallback,
    isLoading,
    isRefreshing,
    retry,
    tier,
  } = useOrgFeatures();
  const endpoint = mcpEndpoint();
  const availability = mcpAvailabilityState({
    allowed: capabilities.mcpServer,
    alreadyPro: tier === "pro",
    failed: Boolean(error) || isFallback,
    loading: isLoading,
  });
  const isAvailable = availability === "available";

  const control = (() => {
    if (availability === "loading") {
      return (
        <span className="inline-flex items-center gap-1.5" aria-hidden>
          <Skeleton className="size-1.5 rounded-full motion-reduce:animate-none" />
          <Skeleton className="h-3 w-12 motion-reduce:animate-none" />
        </span>
      );
    }
    if (isAvailable) return undefined;
    if (availability === "unavailable") {
      return (
        <Button
          disabled={isRefreshing}
          onClick={() => void retry()}
          size="sm"
          variant="outline"
        >
          {isRefreshing ? "Retrying…" : "Retry"}
        </Button>
      );
    }
    if (availability === "upgrade") return <UpgradeCta compact tier="pro" />;
    return undefined;
  })();

  const description = (() => {
    if (availability === "loading") {
      return <Skeleton className="h-3 w-44 motion-reduce:animate-none" />;
    }
    if (availability === "unavailable") return "Availability couldn't load";
    if (availability === "disabled") return "MCP access is disabled";
    return "Connect Cloudstash to any MCP client";
  })();

  return (
    <IntegrationItem
      control={control}
      description={description}
      icon={<McpLogo />}
      iconClassName="bg-foreground/5 text-foreground"
      title="MCP"
    >
      {(availability === "loading" || isAvailable) && (
        <div className="mt-3 sm:pl-10">
          {availability === "loading" && (
            <div className="space-y-3" aria-busy>
              <p className="sr-only" role="status">
                Checking MCP availability…
              </p>
              <Skeleton className="h-8 w-full motion-reduce:animate-none" />
              <Skeleton className="h-16 w-full motion-reduce:animate-none" />
            </div>
          )}

          {isAvailable && <McpSetup endpoint={endpoint} />}
        </div>
      )}
    </IntegrationItem>
  );
}
