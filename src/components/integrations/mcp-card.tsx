import { CheckIcon, CopyIcon, NetworkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useOrgFeatures } from "@/hooks/use-org-features";

import {
  MCP_CONNECTION_GUIDANCE,
  MCP_LOCAL_ORIGIN_GUIDANCE,
  mcpAvailabilityState,
  mcpEndpoint,
} from "./mcp-connection";
import { UpgradeCta } from "./upgrade-cta";

export function McpCard() {
  const { capabilities, error, isFallback, isLoading, tier } = useOrgFeatures();
  const { copied, copy } = useCopyToClipboard();
  const endpoint = mcpEndpoint();
  const availability = mcpAvailabilityState({
    allowed: capabilities.mcpServer,
    alreadyPro: tier === "pro",
    failed: Boolean(error) || isFallback,
    loading: isLoading,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <NetworkIcon aria-hidden className="size-3.5" />
          MCP
        </CardTitle>
        <CardDescription>
          Let compatible AI clients search and save links in the workspace you
          approve during connection.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {availability === "loading" ? (
          <>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </>
        ) : availability === "unavailable" ? (
          <p className="text-muted-foreground" role="status">
            MCP availability could not be loaded. Try refreshing this page.
          </p>
        ) : availability === "disabled" ? (
          <p className="text-muted-foreground" role="status">
            MCP is disabled for this workspace. Contact a workspace
            administrator.
          </p>
        ) : availability === "upgrade" ? (
          <UpgradeCta tier="pro" />
        ) : (
          <>
            <div>
              <p className="mb-1 text-muted-foreground">Server URL</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2 font-mono text-xs text-foreground">
                  {endpoint}
                </code>
                <Button
                  aria-label={
                    copied ? "MCP server URL copied" : "Copy MCP server URL"
                  }
                  onClick={() => copy(endpoint)}
                  size="icon"
                  variant="outline"
                >
                  {copied ? (
                    <CheckIcon aria-hidden className="text-green-500" />
                  ) : (
                    <CopyIcon aria-hidden />
                  )}
                </Button>
              </div>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground">
              <dt>Connection</dt>
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
              <dt>Protocol</dt>
              <dd className="text-foreground">
                {MCP_CONNECTION_GUIDANCE.protocol}
              </dd>
              <dt>Scope override</dt>
              <dd className="text-foreground">
                {MCP_CONNECTION_GUIDANCE.scopeOverride}
              </dd>
            </dl>

            <p className="text-muted-foreground">
              Add the server in your MCP client, then sign in to Cloudstash and
              approve access to the workspace shown on the consent screen.
            </p>

            {endpoint.startsWith("http://") && (
              <p className="text-muted-foreground">
                {MCP_LOCAL_ORIGIN_GUIDANCE}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
