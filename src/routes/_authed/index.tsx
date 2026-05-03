import { createFileRoute } from "@tanstack/react-router";

import { LinksPageLayout } from "@/components/links-page-layout";
import { resetTransientPageState } from "@/lib/route-resets";

export const Route = createFileRoute("/_authed/")({
  component: LinksPageLayout,
  onEnter: resetTransientPageState,
  staticData: {
    icon: "inbox",
    title: "Inbox",
    noun: "unread",
    status: "inbox",
    emptyMessage: "No links in your inbox",
  },
});
