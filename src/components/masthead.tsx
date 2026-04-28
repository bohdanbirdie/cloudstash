import { useLocation } from "@tanstack/react-router";
import { memo, useMemo } from "react";

import {
  allLinksCount$,
  archiveCount$,
  completedCount$,
  inboxCount$,
} from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";

const ROUTE_TITLES: Record<string, string> = {
  "/": "Inbox",
  "/all": "All",
  "/completed": "Completed",
  "/archive": "Archive",
};

export const Masthead = memo(function Masthead() {
  const path = useLocation().pathname;
  const title = ROUTE_TITLES[path] ?? "Inbox";

  return (
    <section className="min-w-0">
      <h1 className="text-[52px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
        {title.toUpperCase()}
      </h1>
      <MastheadMeta path={path} />
    </section>
  );
});

// Owns the four livestore count subscriptions. Isolated so subscription
// notifications (which fire even between user actions) don't re-render
// the heavy h1 above.
const MastheadMeta = memo(function MastheadMeta({ path }: { path: string }) {
  const store = useAppStore();

  const inboxCount = store.useQuery(inboxCount$);
  const completedCount = store.useQuery(completedCount$);
  const allLinksCount = store.useQuery(allLinksCount$);
  const { count: archiveCount } = store.useQuery(archiveCount$);

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
      case "/archive":
        return archiveCount === 0
          ? "0 archived"
          : `${archiveCount} archived · auto-expires after 30 days`;
      default:
        return "";
    }
  }, [path, inboxCount, allLinksCount, completedCount, archiveCount]);

  return (
    <div className="mt-2 text-[13px] font-normal text-muted-foreground tabular-nums">
      {meta}
    </div>
  );
});
