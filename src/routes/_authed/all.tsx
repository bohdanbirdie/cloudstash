import { createFileRoute } from "@tanstack/react-router";

import { LinksPageLayout } from "@/components/links-page-layout";
import { resetTransientPageState } from "@/lib/route-resets";

export const Route = createFileRoute("/_authed/all")({
  component: LinksPageLayout,
  onEnter: resetTransientPageState,
  staticData: {
    icon: "list",
    title: "All",
    noun: "links",
    status: "all",
    emptyMessage: "No links saved yet",
  },
});
