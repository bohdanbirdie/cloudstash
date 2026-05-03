import { useMatch } from "@tanstack/react-router";

import { LinkList } from "@/components/link-list/link-list";
import { useFilteredLinks } from "@/hooks/use-filtered-links";

export function LinksPageLayout() {
  const { staticData } = useMatch({ strict: false });
  const links = useFilteredLinks(staticData.status);
  return (
    <div className="pt-3">
      <LinkList links={links} emptyMessage={staticData.emptyMessage ?? ""} />
    </div>
  );
}
