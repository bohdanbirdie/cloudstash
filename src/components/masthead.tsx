import { memo } from "react";

import { TextMorph } from "@/components/ui/text-morph";
import { useFilteredLinks } from "@/hooks/use-filtered-links";
import { usePageStaticData } from "@/hooks/use-page-static-data";

export const Masthead = memo(function Masthead() {
  const { title, status } = usePageStaticData();
  const links = useFilteredLinks(status);

  if (!title || !status) return null;

  return (
    <div className="flex shrink-0 items-baseline justify-between gap-2 px-2 pt-3 pb-1">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <TextMorph
        as="span"
        className="text-xs text-muted-foreground tabular-nums"
      >
        {String(links.length)}
      </TextMorph>
    </div>
  );
});
