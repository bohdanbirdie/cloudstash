import { createFileRoute } from "@tanstack/react-router";

import { LinksPageLayout } from "@/components/links-page-layout";
import { resetTransientPageState } from "@/lib/route-resets";

export const Route = createFileRoute("/_authed/archive")({
  component: LinksPageLayout,
  onEnter: resetTransientPageState,
  staticData: {
    icon: "archive",
    title: "Archive",
    noun: "archived",
    status: "archive",
    emptyMessage: "Archive is empty",
  },
});
