import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { BrandLockup } from "@/components/brand-lockup";
import { SITE_URL } from "@/components/landing/seo-data";
import { LoginAnimation } from "@/components/login-animation";
import { Button } from "@/components/ui/button";
import { authClient, loadAuth } from "@/lib/auth";
import { META_PIXEL_HEAD_SCRIPTS } from "@/lib/meta-pixel";
import { PLANS } from "@/lib/plan";
import { cn } from "@/lib/utils";

async function clearOPFS() {
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory)
    return;
  const root = await navigator.storage.getDirectory();
  for await (const name of root.keys()) {
    if (name.startsWith("livestore")) {
      await root.removeEntry(name, { recursive: true }).catch(() => {});
    }
  }
}

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const auth = await loadAuth();
    const search = new URLSearchParams(window.location.search);
    // This only decides whether to render the login UI for prompt=login. The
    // OAuth provider verifies the signed query server-side before it continues
    // authorization; browser code cannot and does not authenticate `sig`.
    const isOAuthProviderLogin =
      search.has("sig") &&
      search.has("client_id") &&
      search.has("response_type");
    if (auth?.isAuthenticated && !isOAuthProviderLogin) {
      throw redirect({ to: "/inbox" });
    }
  },
  validateSearch: (
    search: Record<string, unknown>
  ): { upgrade?: "plus" | "pro" } => ({
    upgrade:
      search.upgrade === "plus" || search.upgrade === "pro"
        ? search.upgrade
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Cloudstash" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/login` }],
    scripts: [...META_PIXEL_HEAD_SCRIPTS],
  }),
  component: LoginPage,
});

export function LoginSurface({
  heading = "Sign in to Cloudstash",
  onContinue,
  privacyLink,
  termsLink,
}: {
  heading?: string;
  onContinue: () => void;
  privacyLink: ReactNode;
  termsLink: ReactNode;
}) {
  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 p-5 md:p-10">
      <div className="grid w-full max-w-3xl overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 md:min-h-[28rem] md:grid-cols-[1.15fr_0.85fr]">
        <section className="relative flex flex-col justify-center p-7 pt-16 md:p-10">
          {/* Plain anchor, not a router Link: LoginSurface also renders in
              a router-less Storybook story. Absolutely positioned so it
              never shifts the centered content. */}
          <a
            href="/"
            aria-label="Back to the landing page"
            className="absolute top-4 start-4 inline-flex items-center rounded-md px-2.5 py-1.5 transition-colors hover:bg-muted/60"
          >
            <BrandLockup />
          </a>
          <div className="w-full max-w-xs self-center">
            <header className="text-start">
              <h1 className="text-xl font-semibold tracking-tight text-balance">
                {heading}
              </h1>
              <p className="mt-2 text-xs/relaxed text-muted-foreground text-pretty">
                Access your saved links from anywhere.
              </p>
            </header>
            <GoogleButton className="mt-6" onClick={onContinue} />
            <p className="mt-5 text-start text-[0.6875rem]/relaxed text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary">
              By continuing, you agree to our {termsLink} and {privacyLink}.
            </p>
          </div>
        </section>
        <aside
          aria-hidden="true"
          className="relative hidden overflow-hidden bg-primary p-8 text-primary-foreground md:flex md:flex-col md:justify-end"
        >
          <div className="landing-dot-field landing-dot-field-inverse pointer-events-none absolute inset-0" />
          <LoginAnimation
            variant="light"
            className="absolute top-1/2 start-1/2 size-44 -translate-x-1/2 -translate-y-[calc(50%+10px)]"
          />
          <p className="relative max-w-48 text-sm/relaxed font-medium text-pretty">
            Saved links, ready when you need them.
          </p>
        </aside>
      </div>
    </main>
  );
}

function GoogleButton({
  className = "",
  onClick,
}: {
  className?: string;
  onClick: () => void;
}) {
  return (
    <Button
      className={cn(
        "relative h-8 w-full rounded-md border-[#747775] bg-white px-10 text-[14px]/[20px] text-[#1f1f1f] transition-colors duration-150 hover:bg-[#f5f5f5] hover:text-[#1f1f1f] active:not-aria-[haspopup]:translate-y-0 active:bg-[#eeeeee] dark:bg-white dark:text-[#1f1f1f] dark:hover:bg-[#f5f5f5]",
        className
      )}
      onClick={onClick}
      style={{ fontFamily: '"Google Sans", Roboto, Arial, sans-serif' }}
      type="button"
      variant="outline"
    >
      <span className="absolute start-3">
        <GoogleLogo />
      </span>
      <span>Continue with Google</span>
    </Button>
  );
}

function GoogleLogo() {
  return (
    <svg aria-hidden="true" className="size-[1.125rem]" viewBox="0 0 18 18">
      <path
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.909c1.702-1.567 2.684-3.875 2.684-6.614Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.963 10.706A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.168.281-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.45.347 2.823.956 4.038l3.007-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.322 0 2.507.454 3.441 1.346l2.581-2.582C13.464.892 11.43 0 9 0A9 9 0 0 0 .956 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function LoginPage() {
  const upgrade = Route.useSearch({ select: (s) => s.upgrade });
  const callbackURL = upgrade ? `/inbox?upgrade=${upgrade}` : "/inbox";
  const heading = upgrade
    ? `Sign in to start ${PLANS[upgrade].name}`
    : "Sign in to Cloudstash";

  useEffect(() => {
    void clearOPFS();
  }, []);

  return (
    <LoginSurface
      heading={heading}
      onContinue={() =>
        authClient.signIn.social({
          provider: "google",
          callbackURL,
        })
      }
      privacyLink={<Link to="/privacy">Privacy Policy</Link>}
      termsLink={<Link to="/terms">Terms of Service</Link>}
    />
  );
}
