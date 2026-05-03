import { createFileRoute } from "@tanstack/react-router";

import { LinksPageLayout } from "@/components/links-page-layout";
import { resetTransientPageState } from "@/lib/route-resets";

export const Route = createFileRoute("/_authed/completed")({
  component: LinksPageLayout,
  onEnter: resetTransientPageState,
  staticData: {
    icon: "check-circle",
    title: "Completed",
    noun: "completed",
    status: "completed",
    emptyMessage: "No completed links yet",
  },
});
