import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { CloudstashLogo } from "@/components/cloudstash-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { SHELL } from "./shared";

const NAV_ANCHORS: readonly { hash: string; label: string }[] = [
  { hash: "how", label: "How" },
  { hash: "integrations", label: "Integrations" },
  { hash: "features", label: "Features" },
  { hash: "pricing", label: "Pricing" },
  { hash: "faq", label: "FAQ" },
];

export function TopBar() {
  const [nudged, setNudged] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("top");
    const getThreshold = () => Math.max(120, (hero?.offsetHeight ?? 700) - 80);

    const onScroll = () => {
      setNudged(window.scrollY > 4);
      setScrolled(window.scrollY > getThreshold());
    };
    onScroll();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-all duration-200",
        scrolled
          ? "border-border/60 bg-background text-foreground"
          : "border-transparent bg-primary text-primary-foreground",
        !scrolled &&
          nudged &&
          "shadow-[0_2px_8px_-2px_oklch(0.2_0.08_30_/_0.22)]"
      )}
    >
      <div className={`${SHELL} flex h-14 items-center justify-between gap-6`}>
        <Link
          to="/"
          className={cn(
            "group flex items-center gap-2.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            scrolled
              ? "focus-visible:ring-primary/40 focus-visible:ring-offset-background"
              : "focus-visible:ring-primary-foreground/40 focus-visible:ring-offset-primary"
          )}
        >
          <CloudstashLogo className="size-5 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-safe:group-hover:rotate-[20deg]" />
          <span className="text-[13px] font-medium tracking-[-0.005em]">
            cloudstash
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          <span className="hidden items-center gap-0.5 md:inline-flex">
            {NAV_ANCHORS.map((a) => (
              <Link
                key={a.hash}
                to="/"
                hash={a.hash}
                className={cn(
                  "rounded-sm px-2 py-1 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2",
                  scrolled
                    ? "text-foreground hover:bg-foreground/5 focus-visible:ring-primary/40 focus-visible:ring-offset-background"
                    : "text-primary-foreground hover:bg-primary-foreground/10 focus-visible:ring-primary-foreground/40 focus-visible:ring-offset-primary"
                )}
              >
                {a.label}
              </Link>
            ))}
          </span>
          <Button
            render={<Link to="/login" />}
            variant="ghost"
            size="sm"
            className={cn(
              "transition-colors",
              scrolled
                ? "text-foreground hover:bg-foreground/5 hover:text-foreground"
                : "text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            )}
          >
            Sign in
          </Button>
          <Button
            render={<Link to="/login" />}
            size="sm"
            className="bg-foreground text-background hover:bg-foreground/85"
          >
            Try free
          </Button>
        </nav>
      </div>
    </header>
  );
}
