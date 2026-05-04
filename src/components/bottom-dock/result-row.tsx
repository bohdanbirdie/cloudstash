import { CommandItem } from "@/components/ui/command";
import { HighlightedText } from "@/components/ui/highlighted-text";
import { displayTitle } from "@/lib/link-display";
import type { LinkWithDetails, SearchResult } from "@/livestore/queries/links";

interface ResultRowProps {
  link: LinkWithDetails | SearchResult;
  query?: string;
  onSelect: () => void;
}

export function ResultRow({ link, query, onSelect }: ResultRowProps) {
  const title = displayTitle(link);
  return (
    <CommandItem
      value={link.id}
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          {link.favicon && (
            <img
              src={link.favicon}
              alt=""
              className="size-3.5 shrink-0"
              loading="lazy"
              decoding="async"
            />
          )}
          {query ? (
            <HighlightedText
              text={link.domain}
              query={query}
              className="text-xs text-muted-foreground"
            />
          ) : (
            <span className="text-xs text-muted-foreground">{link.domain}</span>
          )}
        </div>
        <div className="truncate text-sm font-medium">
          {query ? <HighlightedText text={title} query={query} /> : title}
        </div>
      </div>
    </CommandItem>
  );
}
