import {
  CommandEmpty,
  CommandGroup,
  CommandList,
} from "@/components/ui/command";
import type { LinkWithDetails, SearchResult } from "@/livestore/queries/links";

import { ResultRow } from "./result-row";

interface SearchContentProps {
  query: string;
  searchResults: readonly SearchResult[];
  recentLinks: readonly LinkWithDetails[];
  onSelect: (link: LinkWithDetails | SearchResult) => void;
}

export function SearchContent({
  query,
  searchResults,
  recentLinks,
  onSelect,
}: SearchContentProps) {
  const showResults = query.length > 0;
  const matchHeading = `${searchResults.length} ${
    searchResults.length === 1 ? "match" : "matches"
  }`;

  if (showResults) {
    return (
      <CommandList className="h-full max-h-full">
        {searchResults.length === 0 ? (
          <CommandEmpty>Nothing matches &ldquo;{query}&rdquo;</CommandEmpty>
        ) : (
          <CommandGroup
            heading={<span className="tabular-nums">{matchHeading}</span>}
          >
            {searchResults.map((link) => (
              <ResultRow
                key={link.id}
                link={link}
                query={query}
                onSelect={() => onSelect(link)}
              />
            ))}
          </CommandGroup>
        )}
      </CommandList>
    );
  }

  return (
    <CommandList className="h-full max-h-full">
      {recentLinks.length > 0 ? (
        <CommandGroup heading="Recent">
          {recentLinks.map((link) => (
            <ResultRow
              key={link.id}
              link={link}
              onSelect={() => onSelect(link)}
            />
          ))}
        </CommandGroup>
      ) : (
        <CommandEmpty>Type to search your links</CommandEmpty>
      )}
    </CommandList>
  );
}
