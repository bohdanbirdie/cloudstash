import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { BrandLockup } from "@/components/brand-lockup";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { SHELL } from "./shared";

const NAV_ANCHORS: readonly { hash: string; label: string }[] = [
  { hash: "integrations", label: "Integrations" },
  { hash: "features", label: "Features" },
  { hash: "pricing", label: "Pricing" },
  { hash: "faq", label: "FAQ" },
];

export function TopBar() {
  const [nudged, setNudged] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setNudged(window.scrollY > 4);
    };
    onScroll();

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b border-transparent bg-linear-to-b from-background via-background/90 to-transparent text-foreground transition-colors duration-200",
        { "border-border/60 bg-background bg-none": nudged }
      )}
    >
      <div
        className={cn(SHELL, "flex h-14 items-center justify-between gap-6")}
      >
        <Link
          to="/"
          className="flex rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <BrandLockup />
        </Link>
        <nav className="flex items-center gap-1">
          <span className="hidden items-center gap-0.5 md:inline-flex">
            {NAV_ANCHORS.map((a) => (
              <Link
                key={a.hash}
                to="/"
                hash={a.hash}
                className="rounded-sm px-2 py-1 text-[13px] font-medium text-foreground outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {a.label}
              </Link>
            ))}
          </span>
          <Button
            nativeButton={false}
            render={<Link to="/login" />}
            variant="ghost"
            size="sm"
            className="text-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            Sign in
          </Button>
          <Button
            nativeButton={false}
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
