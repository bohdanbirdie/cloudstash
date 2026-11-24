import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  CheckIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { authClient, loadAuth } from "@/lib/auth";
import type { AuthState } from "@/lib/auth";
import { isNativeSignInToken, nativeSignInLink } from "@/lib/native-sign-in";
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
          className={cn("size-5", {
            "motion-safe:animate-spin": tone === "progress",
          })}
        />
      </div>
      <header className="mt-5 text-start" role="status">
        <h1 className="text-xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        <p className="mt-2 text-xs/relaxed text-muted-foreground text-pretty">
          {body}
        </p>
      </header>
      {detail}
      {action && <div className="mt-6 grid gap-2">{action}</div>}
    </AuthSplitCard>
  );
}

function AccountChip({ auth }: { auth: AuthState }) {
  const label = auth.name ?? auth.email;
  return (
    <div className="mt-5 flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2.5 ring-1 ring-foreground/10">
      <Avatar>
        {auth.image && <AvatarImage alt="" src={auth.image} />}
        <AvatarFallback>{label.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 text-start">
        {auth.name && (
          <p className="truncate text-sm font-medium" title={auth.name}>
            {auth.name}
          </p>
        )}
        <p
          className="truncate text-xs text-muted-foreground"
          title={auth.email}
        >
          {auth.email}
        </p>
      </div>
    </div>
  );
}

type Handoff =
  | { status: "preparing" }
  | { status: "ready"; link: string }
  | { status: "error"; message: string };

function ConnectNativePage() {
  const auth = Route.useRouteContext({ select: (ctx) => ctx.auth });
  const [handoff, setHandoff] = useState<Handoff>({ status: "preparing" });
  const started = useRef(false);

  const searchParams = new URLSearchParams(window.location.search);
  const state = searchParams.get("state");
  const codeChallenge = searchParams.get("code_challenge");
  const request =
    isNativeSignInToken(state) && isNativeSignInToken(codeChallenge)
      ? { codeChallenge, state }
      : null;

  const prepare = async () => {
    if (!request) return;
    setHandoff({ status: "preparing" });
    try {
      const response = await fetch("/api/connect/native", {
        body: JSON.stringify({ codeChallenge: request.codeChallenge }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data: { code?: string; error?: string } = await response.json();
      if (!response.ok || !data.code) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      const link = nativeSignInLink(data.code, request.state);
      setHandoff({ link, status: "ready" });
      // Opening the app's link is what brings Cloudstash for Mac forward.
      window.location.href = link;
    } catch (err) {
      setHandoff({
        message: err instanceof Error ? err.message : String(err),
        status: "error",
      });
    }
  };

  const ready = !!request && !!auth?.isAuthenticated;

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    void prepare();
  });

  if (!request) {
    return (
      <StatusCard
        tone="problem"
        title="Start from the app"
        body="This page finishes signing in to Cloudstash for Mac. Open the app and choose Sign in."
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
        detail={<AccountChip auth={auth} />}
      />
    ) : (
      <StatusCard
        tone="problem"
        title="Your library isn't ready"
        body="Sign out of Cloudstash on the web and sign in again, then choose Sign in in the app."
        detail={<AccountChip auth={auth} />}
      />
    );
  }

  if (handoff.status === "error") {
    return (
      <StatusCard
        tone="problem"
        title="Couldn't finish signing in"
        body={`Cloudstash couldn't prepare the app's sign-in (${handoff.message}). Try again, or choose Sign in in the app to start over.`}
        detail={<AccountChip auth={auth} />}
        action={
          <Button className="w-full" onClick={prepare} size="lg">
            Try again
          </Button>
        }
      />
    );
  }

  if (handoff.status === "preparing") {
    return (
      <StatusCard
        tone="progress"
        title="Signing in to Cloudstash for Mac"
        body="Preparing your sign-in. This takes a moment."
        detail={<AccountChip auth={auth} />}
      />
    );
  }

  return (
    <StatusCard
      tone="success"
      title="Opening Cloudstash for Mac"
      body="If your browser asks, choose Open. The app signs you in, and you can close this tab."
      detail={<AccountChip auth={auth} />}
      action={
        <a
          className={buttonVariants({ className: "w-full", size: "lg" })}
          href={handoff.link}
        >
          Open Cloudstash for Mac
          <ArrowUpRightIcon aria-hidden="true" data-icon="inline-end" />
        </a>
      }
    />
  );
}
