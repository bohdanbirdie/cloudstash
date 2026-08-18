import { createFileRoute, redirect } from "@tanstack/react-router";
import { Effect } from "effect";
import { Loader2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CloudstashLogo } from "@/components/cloudstash-logo";
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
import {
  consentPermissionDescriptions,
  consentRedirectTarget,
  loadConsentWorkspace,
} from "@/lib/oauth-consent";

const ALLOWED_SCOPES = new Set([
  "openid",
  "offline_access",
  "links:read",
  "links:write",
]);

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
  const redirectTarget = consentRedirectTarget(search);
  const requestedScopes = useMemo(
    () => [...new Set((search.get("scope") ?? "").split(" ").filter(Boolean))],
    [search]
  );
  const permissions = useMemo(
    () => consentPermissionDescriptions(requestedScopes),
    [requestedScopes]
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

    const loadClient = Effect.tryPromise(() =>
      authClient.oauth2.publicClient({ query: { client_id: clientId } })
    ).pipe(
      Effect.match({
        onFailure: () => null,
        onSuccess: (result) => result,
      })
    );
    void Effect.runPromise(loadClient).then((result) => {
      if (!active) return;
      if (!result || result.error || !result.data) {
        setError("Cloudstash could not verify this OAuth client.");
        setStatus("error");
        return;
      }
      setClientName(result.data.client_name ?? "An MCP client");
      setStatus("ready");
    });

    return () => {
      active = false;
    };
  }, [clientId, requestedScopes, workspace]);

  const submitConsent = async (accept: boolean) => {
    setStatus("submitting");
    setError(null);
    const result = await Effect.runPromise(
      Effect.tryPromise(() =>
        authClient.oauth2.consent({
          accept,
          scope: requestedScopes.join(" "),
        })
      ).pipe(
        Effect.match({
          onFailure: () => null,
          onSuccess: (value) => value,
        })
      )
    );

    if (!result || result.error || !result.data?.url) {
      setError("Cloudstash could not complete this authorization request.");
      setStatus("ready");
      return;
    }
    window.location.assign(result.data.url);
  };

  return (
    <main className="bg-background flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex flex-col items-center gap-2 text-center">
            <CloudstashLogo className="size-12" variant="branded" />
            <CardTitle className="text-base">Connect to Cloudstash</CardTitle>
            <CardDescription>
              {clientName ?? "An MCP client"} wants to connect to{" "}
              {workspace.ok ? workspace.workspace.name : "your workspace"}.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {status === "loading" ? (
            <div
              className="text-muted-foreground flex items-center justify-center gap-2 py-4"
              role="status"
            >
              <Loader2Icon
                aria-hidden
                className="size-4 animate-spin motion-reduce:animate-none"
              />
              Verifying client…
            </div>
          ) : permissions.length > 0 ? (
            <div className="space-y-2">
              <p className="font-medium">
                {clientName ?? "This client"} will be able to
              </p>
              <ul className="space-y-2">
                {permissions.map((permission) => (
                  <li className="flex items-start gap-2" key={permission}>
                    <span
                      aria-hidden="true"
                      className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-full"
                    />
                    <span>{permission}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {status === "ready" || status === "submitting" ? (
            <div className="border-border bg-muted/40 rounded-md border p-3 text-xs leading-relaxed">
              <p className="font-medium">Unverified client</p>
              <p className="text-muted-foreground mt-1">
                Continue only if you started this request.
                {redirectTarget ? (
                  <>
                    {" "}
                    It returns to{" "}
                    <code className="break-all text-foreground">
                      {redirectTarget}
                    </code>
                    .
                  </>
                ) : null}
              </p>
            </div>
          ) : null}

          {status !== "loading" && !error ? (
            <p className="text-muted-foreground text-xs">
              Disconnect later from {clientName ?? "your MCP client"}.
            </p>
          ) : null}

          {error ? (
            <p className="text-destructive text-center" role="alert">
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
            Cancel
          </Button>
          <Button
            disabled={status !== "ready"}
            onClick={() => void submitConsent(true)}
          >
            {status === "submitting" ? (
              <>
                <Loader2Icon
                  aria-hidden
                  className="animate-spin motion-reduce:animate-none"
                />
                Connecting…
              </>
            ) : (
              "Connect"
            )}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
