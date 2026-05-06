import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useState } from "react";

import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "inbox", exact: true },
  { to: "/all", label: "all", exact: false },
  { to: "/completed", label: "completed", exact: false },
  { to: "/archive", label: "archive", exact: false },
] as const;

const baseClass =
  "inline-block px-2 py-1.5 leading-none transition-colors duration-150 ease-out hover:text-foreground focus-visible:text-foreground";
const activeClass = "text-foreground font-semibold";

const slideTransition = { duration: 0.18, ease: [0.25, 1, 0.5, 1] } as const;

export function CategoryNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [hovered, setHovered] = useState<string | null>(null);

  const activeKey =
    links.find((l) => (l.exact ? pathname === l.to : pathname.startsWith(l.to)))
      ?.to ?? null;
  const indicatorKey = hovered ?? activeKey;

  return (
    <nav
      aria-label="Categories"
      className="flex items-baseline gap-px text-[13px] text-muted-foreground"
      onMouseLeave={() => setHovered(null)}
    >
      {links.map((link) => {
        const isActive = activeKey === link.to;
        const isIndicator = indicatorKey === link.to;
        return (
          <Link
            key={link.to}
            to={link.to}
            search={{ tag: undefined }}
            activeOptions={link.exact ? { exact: true } : undefined}
            className={cn(baseClass, isActive && activeClass)}
            activeProps={{ "aria-current": "page" }}
            onMouseEnter={() => setHovered(link.to)}
            onFocus={() => setHovered(link.to)}
            onBlur={() => setHovered(null)}
          >
            <span className="relative inline-grid">
              <span
                aria-hidden="true"
                className="invisible col-start-1 row-start-1 font-semibold"
              >
                {link.label}
              </span>
              <span className="col-start-1 row-start-1">{link.label}</span>
              {isIndicator && (
                <motion.span
                  layoutId="category-nav-underline"
                  aria-hidden="true"
                  className="absolute -bottom-1.5 left-0 right-0 h-px bg-current"
                  transition={slideTransition}
                />
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
