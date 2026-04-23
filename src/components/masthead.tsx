import { useLocation } from "@tanstack/react-router";
import { useMemo } from "react";

import {
  allLinksCount$,
  completedCount$,
  inboxCount$,
  trashCount$,
} from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";

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
      <h1 className="text-[52px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
        {title.toUpperCase()}
      </h1>
      <div className="mt-2 text-[13px] font-normal text-muted-foreground tabular-nums">
        {meta}
      </div>
    </section>
  );
}
