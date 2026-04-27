import { Link, useLocation } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

const CATEGORIES = [
  { label: "inbox", path: "/" },
  { label: "all", path: "/all" },
  { label: "completed", path: "/completed" },
  { label: "archive", path: "/archive" },
] as const;

export function CategoryNav() {
  const location = useLocation();

  return (
    <nav
      aria-label="Categories"
      className="flex items-center gap-3 text-[13px] text-muted-foreground"
    >
      {CATEGORIES.map((cat) => {
        const active = location.pathname === cat.path;
        return (
          <Link
            key={cat.path}
            to={cat.path}
            search={(prev) => prev}
            className={cn(
              "transition-colors hover:text-foreground",
              active && "text-foreground"
            )}
          >
            {cat.label}
          </Link>
        );
      })}
    </nav>
  );
}
