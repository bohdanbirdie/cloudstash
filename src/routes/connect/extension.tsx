import { createFileRoute, redirect } from "@tanstack/react-router";
import { CheckCircleIcon, PuzzleIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { CloudstashLogo } from "@/components/cloudstash-logo";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { loadAuth } from "@/lib/auth";
import { pingExtension, sendCredsToExtension } from "@/lib/extension-connect";

export const Route = createFileRoute("/connect/extension")({
  beforeLoad: async () => {
    const auth = await loadAuth();
    if (!auth?.isAuthenticated) throw redirect({ to: "/login" });
  },
  component: ConnectExtensionPage,
});

type Phase =
  | { tag: "checking" }
  | { tag: "not_installed" }
  | { tag: "connecting" }
  | { tag: "connected" }
  | { tag: "error"; message: string };

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

function useExtensionConnect() {
  const [phase, setPhase] = useState<Phase>({ tag: "checking" });
  const [announcement, setAnnouncement] = useState("");
  const [nonce, setNonce] = useState(0);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;

    const mintCredentials = async (): Promise<
      { apiKey: string; orgId: string } | { error: string }
    > => {
      let response: Response;
      try {
        response = await fetch("/api/connect/extension", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        return { error: "Couldn’t reach Cloudstash." };
      }
      if (!response.ok) {
        const body = await parseJson<{ error?: string }>(response);
        return { error: body.error || "Couldn’t generate credentials." };
      }
      return parseJson<{ apiKey: string; orgId: string }>(response);
    };

    const run = async () => {
      setPhase({ tag: "checking" });

      const installed = await pingExtension();
      if (cancelled) return;
      if (!installed) {
        setPhase({ tag: "not_installed" });
        return;
      }

      const minted = await mintCredentials();
      if (cancelled) return;
      if ("error" in minted) {
        setPhase({ tag: "error", message: minted.error });
        return;
      }

      setPhase({ tag: "connecting" });
      const ok = await sendCredsToExtension(minted.apiKey, minted.orgId);
      if (cancelled) return;
      if (!ok) {
        setPhase({
          tag: "error",
          message:
            "We couldn’t hand off to the extension. Make sure it’s installed, then try again.",
        });
        return;
      }

      setPhase({ tag: "connected" });
      setAnnouncement("Extension connected");
      // The background opened this window; it closes itself once the handoff
      // lands so there's no orphaned window dependent on the SW lifecycle.
      closeTimer = setTimeout(() => window.close(), 900);
    };

    void run();
    return () => {
      cancelled = true;
      if (closeTimer) clearTimeout(closeTimer);
    };
  }, [nonce]);

  return { phase, announcement, retry };
}

function ConnectExtensionPage() {
  const { phase, announcement, retry } = useExtensionConnect();

  const subtitle = (() => {
    switch (phase.tag) {
      case "checking":
        return "Looking for the extension…";
      case "connecting":
        return "Linking your account…";
      case "connected":
        return "You’re all set.";
      case "not_installed":
        return "Install the extension to continue.";
      case "error":
        return "Something went wrong.";
    }
  })();

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-3">
          <CloudstashLogo className="size-10 text-foreground" />
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-xl font-semibold tracking-tight">
              Connect the browser extension
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          </div>
        </div>

        {(phase.tag === "checking" || phase.tag === "connecting") && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner />
            <span>{phase.tag === "checking" ? "Checking" : "Connecting"}</span>
          </div>
        )}

        {phase.tag === "connected" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircleIcon className="size-8 text-foreground" aria-hidden />
            <p className="text-sm leading-relaxed text-muted-foreground">
              The extension is connected. This window will close on its own —
              start saving from the toolbar.
            </p>
          </div>
        )}

        {phase.tag === "not_installed" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 px-3 py-3">
              <PuzzleIcon
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                We couldn’t find the Cloudstash extension in this browser.
                Install it, then reopen this page to finish connecting.
              </p>
            </div>
            {/* TODO: link to the Chrome Web Store listing once published. */}
            <Button variant="outline" onClick={retry} className="w-full">
              <RefreshCwIcon className="size-4" />
              I’ve installed it — try again
            </Button>
          </div>
        )}

        {phase.tag === "error" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-destructive">
              {phase.message}
            </p>
            <Button variant="outline" onClick={retry} className="w-full">
              <RefreshCwIcon className="size-4" />
              Try again
            </Button>
          </div>
        )}

        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>
      </div>
    </div>
  );
}
