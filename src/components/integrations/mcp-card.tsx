import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  NetworkIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useOrgFeatures } from "@/hooks/use-org-features";

import {
  MCP_CONNECTION_GUIDANCE,
  MCP_LOCAL_ORIGIN_GUIDANCE,
  MCP_SETUP_STEPS,
  mcpAvailabilityState,
  mcpEndpoint,
} from "./mcp-connection";
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
  const { copied, copy, copyFailed } = useCopyToClipboard();
  const endpoint = mcpEndpoint();
  const availability = mcpAvailabilityState({
    allowed: capabilities.mcpServer,
    alreadyPro: tier === "pro",
    failed: Boolean(error) || isFallback,
    loading: isLoading,
  });
  const isAvailable = availability === "available";

  return (
    <Card aria-labelledby="mcp-card-title">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <NetworkIcon aria-hidden className="size-3.5" />
          <h3 id="mcp-card-title">MCP</h3>
        </CardTitle>
        <CardDescription>
          Let compatible AI clients find, save, organize, and update links in
          the workspace you approve during connection.
        </CardDescription>
        {isAvailable && (
          <CardAction>
            <Badge variant="outline">Ready to connect</Badge>
          </CardAction>
        )}
      </CardHeader>

      <CardContent aria-busy={availability === "loading"} className="space-y-4">
        {availability === "loading" ? (
          <>
            <p className="sr-only" role="status">
              Checking MCP availability…
            </p>
            <Skeleton className="h-4 w-3/4 motion-reduce:animate-none" />
            <Skeleton className="h-9 w-full motion-reduce:animate-none" />
            <Skeleton className="h-4 w-1/2 motion-reduce:animate-none" />
          </>
        ) : availability === "unavailable" ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground" role="status">
              MCP availability could not be loaded.
            </p>
            <Button
              disabled={isRefreshing}
              onClick={() => void retry()}
              variant="outline"
            >
              {isRefreshing ? "Retrying…" : "Retry"}
            </Button>
          </div>
        ) : availability === "disabled" ? (
          <p className="text-muted-foreground" role="status">
            MCP is disabled for this workspace. Contact a workspace
            administrator.
          </p>
        ) : availability === "upgrade" ? (
          <UpgradeCta tier="pro" />
        ) : (
          <>
            <div className="space-y-1.5">
              <p className="font-medium text-foreground" id="mcp-server-url">
                Server URL
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  aria-labelledby="mcp-server-url"
                  className="min-w-0 flex-1 rounded-md border-0 bg-muted px-3 py-2 font-mono text-xs text-foreground outline-none ring-1 ring-foreground/5 focus-visible:ring-2 focus-visible:ring-ring/30"
                  onFocus={(event) => event.currentTarget.select()}
                  readOnly
                  value={endpoint}
                />
                <Button
                  aria-describedby="mcp-copy-feedback"
                  className="min-h-11 w-full sm:min-h-7 sm:w-auto"
                  onClick={() => copy(endpoint)}
                  variant="outline"
                >
                  {copied ? (
                    <CheckIcon aria-hidden />
                  ) : (
                    <CopyIcon aria-hidden />
                  )}
                  {copied ? "Copied" : "Copy URL"}
                </Button>
              </div>
              <p
                className={
                  copyFailed ? "text-destructive" : "text-muted-foreground"
                }
                id="mcp-copy-feedback"
                role="status"
              >
                {copyFailed
                  ? "Couldn’t copy automatically. Select the URL and copy it manually."
                  : copied
                    ? "Server URL copied. Paste it into your MCP client."
                    : "Paste this URL into your MCP client’s HTTP server field."}
              </p>
            </div>

            <section aria-labelledby="mcp-setup-title" className="space-y-2">
              <h4 className="font-medium text-foreground" id="mcp-setup-title">
                Connect in three steps
              </h4>
              <ol className="space-y-2 text-muted-foreground">
                {MCP_SETUP_STEPS.map((step, index) => (
                  <li
                    className="grid grid-cols-[1.25rem_1fr] gap-2"
                    key={step.title}
                  >
                    <span
                      aria-hidden
                      className="flex size-5 items-center justify-center rounded-full bg-muted font-medium text-foreground"
                    >
                      {index + 1}
                    </span>
                    <span>
                      <strong className="font-medium text-foreground">
                        {step.title}
                      </strong>{" "}
                      {step.description}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <Collapsible>
              <CollapsibleTrigger className="group/disclosure flex min-h-9 w-full items-center justify-between rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30">
                <span>Advanced connection details</span>
                <ChevronDownIcon
                  aria-hidden
                  className="size-3.5 transition-transform group-data-[panel-open]/disclosure:rotate-180 motion-reduce:transition-none"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="space-y-3 rounded-md bg-muted/40 p-3 ring-1 ring-foreground/5">
                  <p className="text-muted-foreground">
                    Compatible clients configure these values automatically.
                  </p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground">
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
                    <dt>Protocol</dt>
                    <dd className="text-foreground">
                      {MCP_CONNECTION_GUIDANCE.protocol}
                    </dd>
                    <dt>Scope override</dt>
                    <dd className="text-foreground">
                      {MCP_CONNECTION_GUIDANCE.scopeOverride}
                    </dd>
                    <dt>Requested scopes</dt>
                    <dd>
                      <code className="break-all font-mono text-foreground">
                        {MCP_CONNECTION_GUIDANCE.scopes}
                      </code>
                    </dd>
                  </dl>

                  {endpoint.startsWith("http://") && (
                    <div className="border-t border-border pt-3">
                      <p className="font-medium text-foreground">
                        Local development
                      </p>
                      <p className="text-muted-foreground">
                        {MCP_LOCAL_ORIGIN_GUIDANCE}
                      </p>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </CardContent>
    </Card>
  );
}
