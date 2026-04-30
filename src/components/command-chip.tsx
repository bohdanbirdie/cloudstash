"use client";

import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";

import { useRightPaneActions } from "@/components/right-pane-context";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { HighlightedText } from "@/components/ui/highlighted-text";
import { Kbd } from "@/components/ui/kbd";
import { useTrackLinkOpen } from "@/hooks/use-track-link-open";
import { track } from "@/lib/analytics";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";
import { getHotkeyLabel } from "@/lib/hotkey-label";
import { cn } from "@/lib/utils";
import { recentlyOpenedLinks$, searchLinks$ } from "@/livestore/queries/links";
import type { LinkWithDetails, SearchResult } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";

function ResultRow({
  link,
  query,
  onSelect,
}: {
  link: LinkWithDetails | SearchResult;
  query?: string;
  onSelect: () => void;
}) {
  const title = link.title ? decodeHtmlEntities(link.title) : link.url;
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

export function CommandChip() {
  const store = useAppStore();
  const { openDetail } = useRightPaneActions();
  const trackLinkOpen = useTrackLinkOpen();
  const reducedMotion = useReducedMotion();

  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const deferredQuery = useDeferredValue(value.trim());
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTrackedQuery = useRef("");

  const recentLinks = store.useQuery(recentlyOpenedLinks$);
  const searchResults = store.useQuery(searchLinks$(deferredQuery));
  const showResults = deferredQuery.length > 0;

  useEffect(() => {
    if (!deferredQuery || deferredQuery === lastTrackedQuery.current) return;
    lastTrackedQuery.current = deferredQuery;
    track("search_used", { results_count: searchResults.length });
  }, [deferredQuery, searchResults.length]);

  const close = useCallback(() => {
    setOpen(false);
    setValue("");
    inputRef.current?.blur();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "k" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      setOpen((prev) => {
        const next = !prev;
        if (next) {
          requestAnimationFrame(() => inputRef.current?.focus());
        } else {
          setValue("");
          inputRef.current?.blur();
        }
        return next;
      });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  function handleSelect(link: LinkWithDetails | SearchResult) {
    close();
    trackLinkOpen(link.id);
    openDetail({ linkId: link.id });
  }

  const panelInitial = reducedMotion
    ? { opacity: 0 }
    : { opacity: 0, y: 8, filter: "blur(4px)" };
  const panelAnimate = reducedMotion
    ? { opacity: 1 }
    : { opacity: 1, y: 0, filter: "blur(0px)" };
  const panelExit = reducedMotion
    ? { opacity: 0, transition: { duration: 0.1 } }
    : {
        opacity: 0,
        y: 4,
        filter: "blur(0px)",
        transition: { duration: 0.08 },
      };
  const panelTransition = reducedMotion
    ? { duration: 0.1 }
    : { type: "spring" as const, duration: 0.22, bounce: 0 };

  const matchHeading = `${searchResults.length} ${searchResults.length === 1 ? "match" : "matches"}`;

  return (
    <div
      ref={rootRef}
      role="search"
      className="fixed bottom-7 left-1/2 z-50 w-[480px] -translate-x-1/2"
    >
      <Command shouldFilter={false} className="contents" label="Search links">
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
                      Nothing matches &ldquo;{deferredQuery}&rdquo;
                    </CommandEmpty>
                  ) : (
                    <CommandGroup
                      heading={
                        <span className="tabular-nums">{matchHeading}</span>
                      }
                    >
                      {searchResults.map((link) => (
                        <ResultRow
                          key={link.id}
                          link={link}
                          query={deferredQuery}
                          onSelect={() => handleSelect(link)}
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
                        onSelect={() => handleSelect(link)}
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

        <label
          className={cn(
            "flex h-10 items-center gap-2.5 rounded-full border border-primary/10 bg-popover px-4 shadow-[0_1px_2px_rgb(61_40_20_/_0.08),0_10px_28px_-8px_rgb(61_40_20_/_0.24)] transition-colors dark:border-border dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.3),0_10px_28px_-8px_rgb(0_0_0_/_0.6)]",
            open && "border-primary/25"
          )}
        >
          <SearchIcon
            className="size-4 shrink-0 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <CommandPrimitive.Input
            ref={inputRef}
            value={value}
            onValueChange={setValue}
            onFocus={() => setOpen(true)}
            onBlur={(e) => {
              const next = e.relatedTarget as Node | null;
              if (next && rootRef.current?.contains(next)) return;
              close();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                close();
              }
            }}
            aria-label="Search links"
            placeholder="Search links"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Kbd aria-hidden="true">{getHotkeyLabel("meta+k")}</Kbd>
        </label>
      </Command>
    </div>
  );
}
