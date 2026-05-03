"use client";

import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { Command } from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { useTrackLinkOpen } from "@/hooks/use-track-link-open";
import { track } from "@/lib/analytics";
import { getHotkeyLabel } from "@/lib/hotkey-label";
import { cn } from "@/lib/utils";
import { recentlyOpenedLinks$, searchLinks$ } from "@/livestore/queries/links";
import type { LinkWithDetails, SearchResult } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";
import { useRightPaneStore } from "@/stores/right-pane-store";

import { ResultsPanel } from "./results-panel";

export function CommandChip() {
  const store = useAppStore();
  const openDetail = useRightPaneStore((s) => s.openDetail);
  const trackLinkOpen = useTrackLinkOpen();

  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const recentLinks = store.useQuery(recentlyOpenedLinks$);
  const searchResults = store.useQuery(searchLinks$(value.trim()));

  const close = useCallback(() => {
    setOpen(false);
    setValue("");
    inputRef.current?.blur();
  }, []);

  useHotkeys(
    "meta+k,ctrl+k",
    () => {
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
    },
    {
      preventDefault: true,
      enableOnFormTags: ["input", "textarea"],
      scopes: ["global"],
    }
  );

  function handleSelect(link: LinkWithDetails | SearchResult) {
    close();
    trackLinkOpen(link.id);
    openDetail(link.id);
  }

  return (
    <div
      ref={rootRef}
      role="search"
      className="fixed bottom-7 left-1/2 z-50 w-[480px] -translate-x-1/2"
    >
      <Command shouldFilter={false} className="contents" label="Search links">
        <ResultsPanel
          open={open}
          query={value.trim()}
          searchResults={searchResults}
          recentLinks={recentLinks}
          onSelect={handleSelect}
        />

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
            onFocus={() => {
              setOpen(true);
              track("search_used");
            }}
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
