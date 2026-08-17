import { createFileRoute, redirect } from "@tanstack/react-router";
import { LinkIcon, Loader2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient, loadAuth } from "@/lib/auth";
import { loadConsentWorkspace } from "@/lib/oauth-consent";

const ALLOWED_SCOPES = new Set([
  "openid",
  "offline_access",
  "links:read",
  "links:write",
]);

const scopeDescription = (scope: string): string => {
  switch (scope) {
    case "links:read":
      return "View links saved in your active workspace";
    case "links:write":
      return "Save new links to your active workspace";
    case "openid":
      return "Confirm your Cloudstash account identity";
    case "offline_access":
      return "Let this client refresh access until its token is revoked";
    default:
      return scope;
  }
};

export const Route = createFileRoute("/oauth-consent")({
  beforeLoad: async () => {
    const auth = await loadAuth();
    if (!auth?.isAuthenticated) throw redirect({ to: "/login" });
  },
  loader: () => loadConsentWorkspace(),
  component: OAuthConsentPage,
});

function OAuthConsentPage() {
  const workspace = Route.useLoaderData();
  const search = useMemo(() => new URLSearchParams(window.location.search), []);
  const clientId = search.get("client_id") ?? "";
  const requestedScopes = useMemo(
    () => [...new Set((search.get("scope") ?? "").split(" ").filter(Boolean))],
    [search]
  );
  const requestsWorkspaceAccess = requestedScopes.some((scope) =>
    scope.startsWith("links:")
  );
  const [clientName, setClientName] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "submitting" | "error"
  >("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!workspace.ok) {
      setError(workspace.error);
      setStatus("error");
      return;
    }
    if (
      !clientId ||
      requestedScopes.length === 0 ||
      requestedScopes.some((scope) => !ALLOWED_SCOPES.has(scope))
    ) {
      setError("This authorization request is missing required information.");
      setStatus("error");
      return;
    }

    void authClient.oauth2
      .publicClient({ query: { client_id: clientId } })
      .then(({ data, error: clientError }) => {
        if (!active) return;
        if (clientError || !data) {
          setError("Cloudstash could not verify this OAuth client.");
          setStatus("error");
          return;
        }
        setClientName(data.client_name ?? "An MCP client");
        setStatus("ready");
      });

    return () => {
      active = false;
    };
  }, [clientId, requestedScopes, workspace]);

  const submitConsent = async (accept: boolean) => {
    setStatus("submitting");
    setError(null);
    const { data, error: consentError } = await authClient.oauth2.consent({
      accept,
      scope: requestedScopes.join(" "),
    });

    if (consentError || !data?.url) {
      setError("Cloudstash could not complete this authorization request.");
      setStatus("ready");
      return;
    }
    window.location.assign(data.url);
  };

  return (
    <main className="bg-background flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="bg-muted mb-2 flex size-12 items-center justify-center rounded-full">
            <LinkIcon className="size-6" strokeWidth={1.5} />
          </div>
          <CardTitle className="text-base">Connect to Cloudstash</CardTitle>
          <CardDescription>
            {clientName ?? "An MCP client"} wants to{" "}
            {requestsWorkspaceAccess
              ? "access links in your active workspace"
              : "confirm your Cloudstash identity"}
            .
          </CardDescription>
        </CardHeader>

        <CardContent>
          {status === "loading" ? (
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-4">
              <Loader2Icon className="size-4 animate-spin" />
              Verifying client…
            </div>
          ) : requestedScopes.length > 0 ? (
            <ul className="bg-muted/50 space-y-2 rounded-md p-3">
              {requestedScopes.map((scope) => (
                <li className="flex items-start gap-2" key={scope}>
                  <span
                    aria-hidden="true"
                    className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-full"
                  />
                  <span>{scopeDescription(scope)}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {workspace.ok ? (
            <div className="border-border mt-3 flex items-center justify-between gap-3 border-t pt-3 text-sm">
              <span className="text-muted-foreground">Workspace</span>
              <span
                className="truncate font-medium"
                title={workspace.workspace.name}
              >
                {workspace.workspace.name}
              </span>
            </div>
          ) : null}

          {status !== "loading" && !error ? (
            <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
              To disconnect later, use your MCP client&apos;s revoke or
              disconnect control. A previously issued access token can remain
              valid for up to five minutes; workspace access and plan
              eligibility are checked on every request.
            </p>
          ) : null}

          {error ? (
            <p className="text-destructive mt-3 text-center" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>

        <CardFooter className="grid grid-cols-2 gap-2">
          <Button
            disabled={status !== "ready"}
            onClick={() => void submitConsent(false)}
            variant="outline"
          >
            Deny
          </Button>
          <Button
            disabled={status !== "ready"}
            onClick={() => void submitConsent(true)}
          >
            {status === "submitting" ? (
              <>
                <Loader2Icon className="animate-spin" />
                Connecting…
              </>
            ) : (
              "Allow"
            )}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
