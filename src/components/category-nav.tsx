import { Link } from "@tanstack/react-router";

const baseClass = "transition-colors hover:text-foreground";
const activeClass = "text-foreground";

export function CategoryNav() {
  return (
    <nav
      aria-label="Categories"
      className="flex items-center gap-3 text-[13px] text-muted-foreground"
    >
      <Link
        to="/"
        search={{ tag: undefined }}
        activeOptions={{ exact: true }}
        className={baseClass}
        activeProps={{ className: activeClass, "aria-current": "page" }}
      >
        inbox
      </Link>
      <Link
        to="/all"
        search={{ tag: undefined }}
        className={baseClass}
        activeProps={{ className: activeClass, "aria-current": "page" }}
      >
        all
      </Link>
      <Link
        to="/completed"
        search={{ tag: undefined }}
        className={baseClass}
        activeProps={{ className: activeClass, "aria-current": "page" }}
      >
        completed
      </Link>
      <Link
        to="/archive"
        search={{ tag: undefined }}
        className={baseClass}
        activeProps={{ className: activeClass, "aria-current": "page" }}
      >
        archive
      </Link>
    </nav>
  );
}
