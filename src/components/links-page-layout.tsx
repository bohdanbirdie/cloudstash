import { useMatch } from "@tanstack/react-router";

import { LinkList } from "@/components/link-list/link-list";
import { useFilteredLinks } from "@/hooks/use-filtered-links";
import { useTagFilter } from "@/hooks/use-tag-filter";

export function LinksPageLayout() {
  const { staticData } = useMatch({ strict: false });
  const { tag } = useTagFilter();
  const links = useFilteredLinks(staticData.status);
  const listKey = `${staticData.status ?? "all"}:${tag ?? ""}`;
  const showPasteHint =
    staticData.status === "all" || staticData.status === "inbox";
  return (
    <div className="pt-3">
      <LinkList
        links={links}
        emptyMessage={staticData.emptyMessage ?? ""}
        showPasteHint={showPasteHint}
        listKey={listKey}
      />
    </div>
  );
}
