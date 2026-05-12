import { CloudstashLogo } from "@/components/cloudstash-logo";
import { SectionEyebrow } from "@/components/right-pane/detail-view/section-eyebrow";

import { SHELL } from "./shared";

const FOOTER_COLS: readonly {
  title: string;
  links: readonly { label: string; href: string }[];
}[] = [
  {
    title: "Product",
    links: [
      { label: "Save your first link", href: "/login" },
      { label: "How it works", href: "#how" },
      { label: "Pricing", href: "#pricing" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Save from",
    links: [
      { label: "Telegram", href: "#where" },
      { label: "Raycast", href: "#where" },
      { label: "iOS Shortcut", href: "#where" },
      { label: "Chrome extension", href: "#where" },
      { label: "X bookmarks", href: "#where" },
    ],
  },
  {
    title: "About",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Contact", href: "/contact" },
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
                    <a
                      href={l.href}
                      className="rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {l.label}
                    </a>
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
