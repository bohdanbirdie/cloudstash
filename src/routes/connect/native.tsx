import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircleIcon, Loader2Icon, MonitorIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authClient, loadAuth } from "@/lib/auth";
import {
  isAllowedNativeRedirectUri,
  isNativeCodeChallenge,
} from "@/lib/native-redirect";
import { LoginSurface } from "@/routes/login";

export const Route = createFileRoute("/connect/native")({
  beforeLoad: async () => ({ auth: await loadAuth() }),
  head: () => ({
    meta: [
      { title: "Sign in to Cloudstash for Mac" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ConnectNativePage,
});

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <MonitorIcon aria-hidden="true" className="size-6" />
          </div>
          {children}
        </CardContent>
      </Card>
    </main>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-balance">{title}</h1>
        <p className="text-sm text-muted-foreground text-pretty">{body}</p>
      </div>
    </Shell>
  );
}

function ConnectNativePage() {
  const auth = Route.useRouteContext({ select: (ctx) => ctx.auth });
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const searchParams = new URLSearchParams(window.location.search);
  const state = searchParams.get("state");
  const redirectUri = searchParams.get("redirect_uri");
  const codeChallenge = searchParams.get("code_challenge");
  const request =
    state &&
    isAllowedNativeRedirectUri(redirectUri) &&
    isNativeCodeChallenge(codeChallenge)
      ? { codeChallenge, redirectUri, state }
      : null;

  const connect = async () => {
    if (!request) return;
    setStatus("connecting");
    setError(null);
    try {
      const response = await fetch("/api/connect/native", {
        body: JSON.stringify({ codeChallenge: request.codeChallenge }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const data: { error?: string } = await response.json();
        throw new Error(data.error || "Sign-in failed");
      }
      const { code }: { code: string } = await response.json();
      const callbackUrl = new URL(request.redirectUri);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", request.state);
      // The app finishes sign-in and sends the browser back here to show the
      // result.
      window.location.href = callbackUrl.toString();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  };

  // A signed-in browser finishes the app's sign-in on its own, with no
  // confirmation step.
  const ready = !!request && !!auth?.isAuthenticated;

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    void connect();
  });

  if (searchParams.has("connected")) {
    return (
      <Shell>
        <div className="space-y-1">
          <h1 className="flex items-center justify-center gap-2 text-lg font-semibold">
            <CheckCircleIcon
              aria-hidden="true"
              className="size-5 text-green-500"
            />
            You're signed in
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">
            You can close this tab and return to Cloudstash for Mac.
          </p>
        </div>
      </Shell>
    );
  }

  if (searchParams.has("failed")) {
    return (
      <Message
        title="Sign-in didn't finish"
        body="Return to Cloudstash for Mac and try again."
      />
    );
  }

  if (!request) {
    return (
      <Message
        title="Sign in to Cloudstash for Mac"
        body="Open this page from the Cloudstash app to sign in."
      />
    );
  }

  if (!auth) {
    return (
      <LoginSurface
        heading="Sign in to Cloudstash for Mac"
        onContinue={() =>
          authClient.signIn.social({
            callbackURL: `${window.location.pathname}${window.location.search}`,
            provider: "google",
          })
        }
        privacyLink={<Link to="/privacy">Privacy Policy</Link>}
        termsLink={<Link to="/terms">Terms of Service</Link>}
      />
    );
  }

  if (!auth.isAuthenticated) {
    return auth.status === "unapproved" ? (
      <Message
        title="Your account is awaiting approval"
        body="You can sign in to Cloudstash for Mac once your account is approved."
      />
    ) : (
      <Message
        title="Your library isn't ready"
        body="Sign out of Cloudstash on the web, sign in again, then retry from the app."
      />
    );
  }

  return (
    <Shell>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-balance">
          Sign in to Cloudstash for Mac
        </h1>
        <p className="text-sm text-muted-foreground text-pretty">
          {status === "error"
            ? "Sign-in didn't finish."
            : `Signing in as ${auth.email}…`}
        </p>
      </div>
      {status === "error" ? (
        <Button className="w-full" onClick={connect}>
          Try again
        </Button>
      ) : (
        <Loader2Icon
          aria-hidden="true"
          className="size-5 animate-spin text-muted-foreground"
        />
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </Shell>
  );
}
