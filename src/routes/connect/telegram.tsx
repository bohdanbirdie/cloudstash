import { createFileRoute, redirect } from "@tanstack/react-router";
import { CheckCircleIcon, Loader2Icon, SendIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadAuth } from "@/lib/auth";

export const Route = createFileRoute("/connect/telegram")({
  beforeLoad: async () => {
    const auth = await loadAuth();
    if (!auth?.isAuthenticated) throw redirect({ to: "/login" });
  },
  component: ConnectTelegramPage,
});

type Validity = "checking" | "valid" | "invalid";

function ConnectTelegramPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const code = searchParams.get("code");

  const [validity, setValidity] = useState<Validity>(
    code ? "checking" : "invalid"
  );
  const [status, setStatus] = useState<
    "idle" | "connecting" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    let aborted = false;

    const check = async () => {
      try {
        const response = await fetch(
          `/api/connect/telegram/check?code=${encodeURIComponent(code)}`
        );
        if (!response.ok) throw new Error("Check failed");
        const data: { valid: boolean } = await response.json();
        if (!aborted) setValidity(data.valid ? "valid" : "invalid");
      } catch {
        if (!aborted) setValidity("invalid");
      }
    };
    void check();

    return () => {
      aborted = true;
    };
  }, [code]);

  const handleConnect = async () => {
    if (!code) return;
    setStatus("connecting");
    setError(null);

    try {
      const response = await fetch("/api/connect/telegram/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        const data: { error?: string } = await response.json();
        // Server-side validity changed under us — surface as "invalid"
        // rather than a generic error.
        if (response.status === 400) {
          setValidity("invalid");
          return;
        }
        throw new Error(data.error || "Failed to connect");
      }

      setStatus("success");
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
            <SendIcon className="h-6 w-6" />
          </div>

          <div className="text-center space-y-1">
            <h1 className="text-lg font-semibold">Connect Telegram</h1>
            <p className="text-sm text-muted-foreground">
              Link your Telegram chat to save links straight from the bot.
            </p>
          </div>

          {validity === "checking" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="animate-spin" />
              Checking link…
            </div>
          ) : validity === "invalid" ? (
            <p className="text-sm text-muted-foreground text-center">
              {!code
                ? "This page should be opened from the Telegram bot."
                : "This connection link is invalid or expired. Send another message to the bot to get a fresh one."}
            </p>
          ) : status === "success" ? (
            <div className="flex items-center gap-2 text-sm text-green-500">
              <CheckCircleIcon className="size-4" />
              Connected — you can return to Telegram.
            </div>
          ) : (
            <Button
              className="w-full"
              onClick={handleConnect}
              disabled={status === "connecting"}
            >
              {status === "connecting" ? (
                <>
                  <Loader2Icon className="animate-spin" />
                  Connecting…
                </>
              ) : (
                "Confirm connection"
              )}
            </Button>
          )}

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
