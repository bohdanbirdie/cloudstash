import { Link } from "@tanstack/react-router";

import { BrandLockup } from "@/components/brand-lockup";
import { SectionEyebrow } from "@/components/right-pane/detail-view/section-eyebrow";
import { cn } from "@/lib/utils";

import { SHELL } from "./shared";

type FooterLink = { label: string; to: string; hash?: string };

const FOOTER_COLS: readonly {
  title: string;
  links: readonly FooterLink[];
}[] = [
  {
    title: "Product",
    links: [
      { label: "Save your first link", to: "/login" },
      { label: "Features", to: "/", hash: "features" },
      { label: "Pricing", to: "/", hash: "pricing" },
      { label: "FAQ", to: "/", hash: "faq" },
    ],
  },
  {
    title: "Save from",
    links: [
      { label: "Telegram", to: "/", hash: "integrations" },
      { label: "Raycast", to: "/", hash: "integrations" },
      { label: "Chrome extension", to: "/", hash: "integrations" },
      { label: "X bookmarks", to: "/", hash: "integrations" },
    ],
  },
  {
    title: "About",
    links: [
      { label: "Privacy", to: "/privacy" },
      { label: "Terms", to: "/terms" },
      { label: "Contact", to: "/contact" },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer>
      <div
        className={cn(
          SHELL,
          "grid gap-10 py-10 sm:grid-cols-[1.4fr_repeat(3,1fr)] sm:gap-12 sm:py-12"
        )}
      >
        <div>
          <BrandLockup variant="branded" />
          <p className="mt-3 max-w-[34ch] text-pretty text-xs leading-relaxed text-muted-foreground">
            Your saved links, ready when you need them.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-6 sm:contents">
          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <SectionEyebrow>{col.title}</SectionEyebrow>
              <ul className="mt-3 grid gap-2 text-[13px]">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      to={l.to}
                      hash={l.hash}
                      className="rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div
        className={cn(
          SHELL,
          "border-t border-border/60 py-5 text-xs text-muted-foreground"
        )}
      >
        © {year} cloudstash
      </div>
    </footer>
  );
}
