import { Link } from "@tanstack/react-router";

import { CloudstashLogo } from "@/components/cloudstash-logo";
import { Button } from "@/components/ui/button";

import { SHELL } from "./shared";

const NAV_ANCHORS = [
  { href: "#how", label: "How" },
  { href: "#where", label: "Where" },
  { href: "#benefits", label: "Benefits" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function TopBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className={`${SHELL} flex h-14 items-center justify-between gap-6`}>
        <a
          href="#top"
          className="flex items-center gap-2.5 rounded-sm outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <CloudstashLogo className="size-5 rounded-sm" variant="branded" />
          <span className="text-[13px] font-medium tracking-[-0.005em]">
            cloudstash
          </span>
        </a>
        <nav className="flex items-center gap-1">
          <span className="hidden items-center gap-0.5 md:inline-flex">
            {NAV_ANCHORS.map((a) => (
              <a
                key={a.href}
                href={a.href}
                className="rounded-sm px-2 py-1 text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {a.label}
              </a>
            ))}
          </span>
          <Button render={<Link to="/login" />} variant="ghost" size="sm">
            Sign in
          </Button>
          <Button render={<Link to="/login" />} size="sm">
            Try free
          </Button>
        </nav>
      </div>
    </header>
  );
}
