import { AnimatePresence, motion } from "motion/react";

import {
  CommandEmpty,
  CommandGroup,
  CommandList,
} from "@/components/ui/command";
import type { LinkWithDetails, SearchResult } from "@/livestore/queries/links";

import { ResultRow } from "./result-row";

const panelInitial = { opacity: 0, y: 8, filter: "blur(4px)" };
const panelAnimate = { opacity: 1, y: 0, filter: "blur(0px)" };
const panelExit = {
  opacity: 0,
  y: 4,
  filter: "blur(0px)",
  transition: { duration: 0.08 },
};
const panelTransition = {
  type: "spring" as const,
  duration: 0.22,
  bounce: 0,
};

interface ResultsPanelProps {
  open: boolean;
  query: string;
  searchResults: readonly SearchResult[];
  recentLinks: readonly LinkWithDetails[];
  onSelect: (link: LinkWithDetails | SearchResult) => void;
}

export function ResultsPanel({
  open,
  query,
  searchResults,
  recentLinks,
  onSelect,
}: ResultsPanelProps) {
  const showResults = query.length > 0;
  const matchHeading = `${searchResults.length} ${
    searchResults.length === 1 ? "match" : "matches"
  }`;

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="panel"
          initial={panelInitial}
          animate={panelAnimate}
          exit={panelExit}
          transition={panelTransition}
          className="mb-2 overflow-hidden rounded-lg border border-primary/10 bg-popover text-popover-foreground shadow-[0_1px_2px_rgb(61_40_20_/_0.08),0_12px_36px_-10px_rgb(61_40_20_/_0.26)] dark:border-border dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.3),0_12px_36px_-10px_rgb(0_0_0_/_0.65)]"
        >
          <CommandList className="max-h-96">
            {showResults ? (
              searchResults.length === 0 ? (
                <CommandEmpty>
                  Nothing matches &ldquo;{query}&rdquo;
                </CommandEmpty>
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
              )
            ) : recentLinks.length > 0 ? (
              <CommandGroup heading="Recently opened">
                {recentLinks.map((link) => (
                  <ResultRow
                    key={link.id}
                    link={link}
                    onSelect={() => onSelect(link)}
                  />
                ))}
              </CommandGroup>
            ) : (
              <CommandEmpty>Type to search</CommandEmpty>
            )}
          </CommandList>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
