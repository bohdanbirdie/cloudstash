import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { authClient, loadAuth } from "@/lib/auth";
import {
  isAllowedNativeRedirectUri,
  isNativeCodeChallenge,
} from "@/lib/native-redirect";
import { cn } from "@/lib/utils";
import { AuthSplitCard, LoginSurface } from "@/routes/login";

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

type Tone = "progress" | "success" | "problem";

const TONE_ICON = {
  problem: TriangleAlertIcon,
  progress: Loader2Icon,
  success: CheckIcon,
} as const;

function StatusCard({
  action,
  body,
  detail,
  title,
  tone,
}: {
  action?: ReactNode;
  body: ReactNode;
  detail?: ReactNode;
  title: string;
  tone: Tone;
}) {
  const Icon = TONE_ICON[tone];
  return (
    <AuthSplitCard>
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-full ring-1",
          {
            "bg-destructive/10 text-destructive ring-destructive/20":
              tone === "problem",
            "bg-muted text-muted-foreground ring-foreground/10":
              tone === "progress",
            "bg-primary text-primary-foreground ring-primary":
              tone === "success",
          }
        )}
      >
        <Icon
          aria-hidden="true"
          className={cn("size-5", { "animate-spin": tone === "progress" })}
        />
      </div>
      <header className="mt-5 text-start" aria-live="polite">
        <h1 className="text-xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        <p className="mt-2 text-xs/relaxed text-muted-foreground text-pretty">
          {body}
        </p>
      </header>
      {detail}
      {action && <div className="mt-6">{action}</div>}
    </AuthSplitCard>
  );
}

function AccountChip({ email, name }: { email: string; name: string | null }) {
  return (
    <div className="mt-5 flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2.5 ring-1 ring-foreground/10">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground uppercase">
        {(name ?? email).slice(0, 1)}
      </div>
      <div className="min-w-0 text-start">
        {name && <p className="truncate text-sm font-medium">{name}</p>}
        <p className="truncate text-xs text-muted-foreground">{email}</p>
      </div>
    </div>
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
      <StatusCard
        tone="success"
        title="You're signed in"
        body="Cloudstash for Mac has your library. You can close this tab and switch back to the app."
        detail={
          auth?.isAuthenticated && (
            <AccountChip email={auth.email} name={auth.name} />
          )
        }
      />
    );
  }

  if (searchParams.has("failed")) {
    return (
      <StatusCard
        tone="problem"
        title="Sign-in didn't finish"
        body="Cloudstash for Mac couldn't complete sign-in. Switch back to the app and click Sign in to try again."
      />
    );
  }

  if (!request) {
    return (
      <StatusCard
        tone="problem"
        title="Open this from the app"
        body="This page signs in Cloudstash for Mac. Start from Sign in in the app."
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
      <StatusCard
        tone="problem"
        title="Your account is awaiting approval"
        body="You can sign in to Cloudstash for Mac once your account is approved."
      />
    ) : (
      <StatusCard
        tone="problem"
        title="Your library isn't ready"
        body="Sign out of Cloudstash on the web, sign in again, then retry from the app."
      />
    );
  }

  return status === "error" ? (
    <StatusCard
      tone="problem"
      title="Sign-in didn't finish"
      body={error ?? "Something went wrong."}
      detail={<AccountChip email={auth.email} name={auth.name} />}
      action={
        <Button className="w-full" onClick={connect}>
          Try again
        </Button>
      }
    />
  ) : (
    <StatusCard
      tone="progress"
      title="Signing in to Cloudstash for Mac"
      body="Handing your session to the app. This takes a moment."
      detail={<AccountChip email={auth.email} name={auth.name} />}
    />
  );
}
