import { Link, useLocation } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { useTagFilter } from "@/hooks/use-tag-filter";
import { cn } from "@/lib/utils";
import {
  inboxCount$,
  completedCount$,
  allLinksCount$,
  trashCount$,
} from "@/livestore/queries/links";
import { allTagsWithCounts$ } from "@/livestore/queries/tags";
import { useAppStore } from "@/livestore/store";

const CATEGORIES = [
  { label: "inbox", path: "/" },
  { label: "all", path: "/all" },
  { label: "completed", path: "/completed" },
  { label: "trash", path: "/trash" },
] as const;

const MAX_VISIBLE_TAGS = 5;

const ROUTE_TITLES: Record<string, string> = {
  "/": "Inbox",
  "/all": "All",
  "/completed": "Completed",
  "/trash": "Trash",
};

export function Masthead() {
  const location = useLocation();
  const store = useAppStore();

  const inboxCount = store.useQuery(inboxCount$);
  const completedCount = store.useQuery(completedCount$);
  const allLinksCount = store.useQuery(allLinksCount$);
  const { count: trashCount } = store.useQuery(trashCount$);

  const counts = useMemo(
    () => ({
      "/": inboxCount,
      "/all": allLinksCount,
      "/completed": completedCount,
      "/trash": trashCount,
    }),
    [inboxCount, allLinksCount, completedCount, trashCount]
  );

  const path = location.pathname;
  const title = ROUTE_TITLES[path] ?? "Inbox";
  const meta = useMemo(() => {
    switch (path) {
      case "/":
        return inboxCount === 0 ? "0 unread" : `${inboxCount} unread`;
      case "/all":
        return allLinksCount === 0 ? "0 links" : `${allLinksCount} links`;
      case "/completed":
        return completedCount === 0
          ? "0 completed"
          : `${completedCount} completed`;
      case "/trash":
        return trashCount === 0
          ? "0 in trash"
          : `${trashCount} in trash · auto-expires after 30 days`;
      default:
        return "";
    }
  }, [path, inboxCount, allLinksCount, completedCount, trashCount]);

  return (
    <section className="min-w-0">
      <h1 className="text-[52px] font-bold leading-none tracking-[-0.02em] text-foreground tabular-nums">
        {title.toUpperCase()}
      </h1>
      <div className="mt-2 text-[13px] font-normal text-muted-foreground tabular-nums">
        {meta}
      </div>

      <nav
        className="mt-8 text-[15px] leading-[1.4] text-muted-foreground"
        aria-label="Categories"
      >
        {CATEGORIES.map((cat, i) => {
          const active = location.pathname === cat.path;
          return (
            <span key={cat.path}>
              {i > 0 && <span className="px-1 text-foreground/30">·</span>}
              <Link
                to={cat.path}
                className={cn(
                  "font-normal text-muted-foreground transition-colors hover:text-foreground",
                  active &&
                    "font-semibold text-primary underline decoration-primary decoration-2 underline-offset-[6px] hover:text-primary"
                )}
              >
                {cat.label}
                <span className="sr-only"> ({counts[cat.path]})</span>
              </Link>
            </span>
          );
        })}
      </nav>

      <TagStrip />
    </section>
  );
}

function TagStrip() {
  const store = useAppStore();
  const tags = store.useQuery(allTagsWithCounts$);
  const {
    tags: selected,
    untagged,
    addTag,
    removeTag,
    setUntagged,
  } = useTagFilter();

  const [expanded, setExpanded] = useState(false);

  const sortedTags = useMemo(
    () => [...tags].toSorted((a, b) => b.count - a.count),
    [tags]
  );

  if (sortedTags.length === 0 && !untagged) {
    return <div className="mt-3 h-[18px]" aria-hidden="true" />;
  }

  const hidden = Math.max(0, sortedTags.length - MAX_VISIBLE_TAGS);
  const visible = expanded ? sortedTags : sortedTags.slice(0, MAX_VISIBLE_TAGS);

  return (
    <div className="mt-3 flex w-full flex-wrap items-baseline gap-[10px] text-[12px] font-medium tracking-[-0.005em]">
      <button
        type="button"
        onClick={() => setUntagged(!untagged)}
        className={cn(
          "text-foreground/40 transition-colors hover:text-foreground",
          untagged && "text-primary"
        )}
        aria-pressed={untagged}
      >
        untagged
      </button>
      {visible.map((tag) => {
        const active = selected.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => (active ? removeTag(tag.id) : addTag(tag.id))}
            className={cn(
              "text-foreground/40 transition-colors hover:text-foreground",
              active && "text-primary"
            )}
            aria-pressed={active}
          >
            #{tag.name}
          </button>
        );
      })}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-foreground/40 transition-colors hover:text-foreground"
          aria-expanded={expanded}
        >
          {expanded ? "less" : `+${hidden} more`}
        </button>
      )}
    </div>
  );
}
