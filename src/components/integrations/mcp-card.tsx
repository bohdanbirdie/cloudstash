import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgFeatures } from "@/hooks/use-org-features";

import { IntegrationItem } from "./integration-card";
import { McpLogo } from "./integration-icons";
import {
  MCP_CONNECTION_GUIDANCE,
  MCP_LOCAL_ORIGIN_GUIDANCE,
  mcpAvailabilityState,
  mcpEndpoint,
} from "./mcp-connection";
import { McpSetupTabs } from "./mcp-setup-tabs";
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
    if (availability === "disabled") return "Disabled for this workspace";
    if (availability === "upgrade")
      return "Connect coding agents to your vault";
    return "Claude Code · Codex · OpenCode";
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
        <div className="mt-3 pl-10">
          {availability === "loading" && (
            <div className="space-y-3" aria-busy>
              <p className="sr-only" role="status">
                Checking MCP availability…
              </p>
              <Skeleton className="h-8 w-full motion-reduce:animate-none" />
              <Skeleton className="h-16 w-full motion-reduce:animate-none" />
            </div>
          )}

          {isAvailable && (
            <div className="space-y-2.5">
              <McpSetupTabs endpoint={endpoint} />

              <Collapsible>
                <CollapsibleTrigger className="group/disclosure flex min-h-8 w-full items-center justify-between rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30">
                  <span>Advanced connection details</span>
                  <ChevronDownIcon
                    aria-hidden
                    className="size-3.5 transition-transform group-data-[panel-open]/disclosure:rotate-180 motion-reduce:transition-none"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <div className="space-y-3 rounded-md bg-muted/40 p-3 ring-1 ring-foreground/5">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground">
                      <dt>Server URL</dt>
                      <dd>
                        <code className="break-all font-mono text-foreground">
                          {endpoint}
                        </code>
                      </dd>
                      <dt>Transport</dt>
                      <dd className="text-foreground">
                        {MCP_CONNECTION_GUIDANCE.transport}
                      </dd>
                      <dt>Authentication</dt>
                      <dd className="text-foreground">
                        {MCP_CONNECTION_GUIDANCE.authentication}
                      </dd>
                      <dt>Registration</dt>
                      <dd className="text-foreground">
                        {MCP_CONNECTION_GUIDANCE.registration}
                      </dd>
                      <dt>Requested scopes</dt>
                      <dd>
                        <code className="break-all font-mono text-foreground">
                          {MCP_CONNECTION_GUIDANCE.scopes}
                        </code>
                      </dd>
                    </dl>

                    {endpoint.startsWith("http://") && (
                      <p className="border-t border-border pt-3 text-muted-foreground">
                        {MCP_LOCAL_ORIGIN_GUIDANCE}
                      </p>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>
      )}
    </IntegrationItem>
  );
}
