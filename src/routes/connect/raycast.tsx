import { createFileRoute, redirect } from "@tanstack/react-router";
import { CommandIcon, Loader2Icon, CheckCircleIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/connect/raycast")({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: "/login" });
    }
  },
  component: ConnectRaycastPage,
});

function ConnectRaycastPage() {
  const [status, setStatus] = useState<
    "idle" | "connecting" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const searchParams = new URLSearchParams(window.location.search);
  const state = searchParams.get("state");
  const redirectUri = searchParams.get("redirect_uri");

  const hasRequiredParams = !!state && !!redirectUri;

  const handleConnect = async () => {
    if (!state || !redirectUri) {
      setError("Missing required parameters");
      setStatus("error");
      return;
    }

    setStatus("connecting");
    setError(null);

    try {
      const response = await fetch("/api/connect/raycast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Failed to connect");
      }

      const { code } = (await response.json()) as { code: string };

      setStatus("success");

      // Redirect back to Raycast using the redirect_uri it provided
      const callbackUrl = new URL(redirectUri);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);

      setTimeout(() => {
        window.location.href = callbackUrl.toString();
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  };

  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <CommandIcon className="h-6 w-6" />
          </div>

          <div className="text-center space-y-1">
            <h1 className="text-lg font-semibold">Connect Raycast</h1>
            <p className="text-sm text-muted-foreground">
              Allow the Raycast extension to save links to your Cloudstash
              account.
            </p>
          </div>

          {status === "success" ? (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircleIcon className="h-4 w-4" />
              Connected! Redirecting to Raycast...
            </div>
          ) : (
            <Button
              className="w-full"
              onClick={handleConnect}
              disabled={status === "connecting" || !hasRequiredParams}
            >
              {status === "connecting" ? (
                <>
                  <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect to Cloudstash"
              )}
            </Button>
          )}

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          {!hasRequiredParams && (
            <p className="text-sm text-muted-foreground text-center">
              This page should be opened from the Raycast extension.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
