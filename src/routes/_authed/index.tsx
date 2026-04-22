import { createFileRoute } from "@tanstack/react-router";

import { LinksPageLayout } from "@/components/links-page-layout";
import { inboxProjection } from "@/lib/link-projections";
import { inboxLinks$ } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";

export const Route = createFileRoute("/_authed/")({
  component: HomePage,
  staticData: { icon: "inbox", title: "Inbox" },
});

function HomePage() {
  const store = useAppStore();
  const links = store.useQuery(inboxLinks$);

  return (
    <LinksPageLayout
      title="Inbox"
      links={links}
      emptyMessage="No links in your inbox"
      projection={inboxProjection}
    />
  );
}
