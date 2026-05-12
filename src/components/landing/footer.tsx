import { Link } from "@tanstack/react-router";

import { CloudstashLogo } from "@/components/cloudstash-logo";
import { SectionEyebrow } from "@/components/right-pane/detail-view/section-eyebrow";

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
      { label: "How it works", to: "/", hash: "how" },
      { label: "Pricing", to: "/", hash: "pricing" },
      { label: "FAQ", to: "/", hash: "faq" },
    ],
  },
  {
    title: "Save from",
    links: [
      { label: "Telegram", to: "/", hash: "connections" },
      { label: "Raycast", to: "/", hash: "connections" },
      { label: "iOS Shortcut", to: "/", hash: "connections" },
      { label: "Chrome extension", to: "/", hash: "connections" },
      { label: "X bookmarks", to: "/", hash: "connections" },
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
    <footer className="border-t border-border/60">
      <div
        className={`${SHELL} grid gap-10 py-10 sm:grid-cols-[1.4fr_repeat(3,1fr)] sm:gap-12 sm:py-12`}
      >
        <div>
          <div className="flex items-center gap-2.5">
            <CloudstashLogo className="size-5 rounded-sm" variant="branded" />
            <span className="text-[13px] font-medium tracking-[-0.005em]">
              cloudstash
            </span>
          </div>
          <p className="mt-3 max-w-[34ch] text-pretty text-xs leading-relaxed text-muted-foreground">
            An inbox for the web. Built for people who save a lot of links and
            want to actually read them.
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
        className={`${SHELL} border-t border-border/60 py-5 text-xs text-muted-foreground`}
      >
        © {year} cloudstash
      </div>
    </footer>
  );
}
