"use client";

import { Command as CommandPrimitive } from "cmdk";
import { animate, useMotionValue } from "motion/react";
import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useRecentLinks } from "@/hooks/use-recent-links";
import { useTrackLinkOpen } from "@/hooks/use-track-link-open";
import { track } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import { searchLinks$ } from "@/livestore/queries/links";
import type { LinkWithDetails, SearchResult } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";
import { useDockStore } from "@/stores/dock-store";
import { useRightPaneStore } from "@/stores/right-pane-store";

import { AgentTrigger } from "./agent-trigger";
import { MorphingPanel } from "./morphing-panel";
import { SearchTrigger } from "./search-trigger";

function useDismiss(
  rootRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  active: boolean
) {
  useHotkeys("esc", () => onDismiss(), {
    enabled: active,
    enableOnFormTags: ["input", "textarea", "option"],
    scopes: ["global"],
  });

  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (target.closest('[data-slot$="-content"]')) return;
      onDismiss();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [active, rootRef, onDismiss]);
}

export function BottomDock() {
  const mode = useDockStore((s) => s.mode);
  const setMode = useDockStore((s) => s.setMode);
  const close = useDockStore((s) => s.close);
  const query = useDockStore((s) => s.query);
  const setQuery = useDockStore((s) => s.setQuery);
  const agentEverOpened = useDockStore((s) => s.agentEverOpened);

  const { orgId } = useAuth();

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const agentTextareaRef = useRef<HTMLTextAreaElement>(null);

  const originMV = useMotionValue<string>("bottom");
  const rightMV = useMotionValue<number>(48);

  const openAgent = useCallback(() => {
    originMV.set("bottom right");
    if (mode === "closed") {
      rightMV.set(0);
    } else {
      animate(rightMV, 0, { type: "spring", bounce: 0, duration: 0.32 });
    }
    setMode("agent");
    requestAnimationFrame(() => agentTextareaRef.current?.focus());
  }, [mode, originMV, rightMV, setMode]);

  const openSearch = useCallback(() => {
    originMV.set("bottom");
    if (mode === "closed") {
      rightMV.set(48);
    } else {
      animate(rightMV, 48, { type: "spring", bounce: 0, duration: 0.32 });
    }
    setMode("search");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [mode, originMV, rightMV, setMode]);

  const toggleAgent = useCallback(() => {
    if (mode === "agent") {
      setMode("closed");
      return;
    }
    openAgent();
  }, [mode, setMode, openAgent]);

  const store = useAppStore();
  const searchResults = store.useQuery(searchLinks$(query.trim()));
  const recentLinks = useRecentLinks();

  const openDetail = useRightPaneStore((s) => s.openDetail);
  const trackLinkOpen = useTrackLinkOpen();

  const dismiss = useCallback(() => {
    if (rootRef.current?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
    close();
  }, [close]);

  useDismiss(rootRef, dismiss, mode !== "closed");

  const handleSelect = useCallback(
    (link: LinkWithDetails | SearchResult) => {
      dismiss();
      trackLinkOpen(link.id);
      openDetail(link.id);
    },
    [dismiss, openDetail, trackLinkOpen]
  );

  useHotkeys(
    "meta+k,ctrl+k",
    () => {
      if (mode === "search") {
        dismiss();
        return;
      }
      openSearch();
      track("search_used");
    },
    {
      preventDefault: true,
      enableOnFormTags: ["input", "textarea", "option"],
      scopes: ["global"],
    }
  );

  useHotkeys("meta+j,ctrl+j", toggleAgent, {
    preventDefault: true,
    enableOnFormTags: ["input", "textarea", "option"],
    scopes: ["global"],
  });

  return (
    <div ref={rootRef} className="fixed right-0 bottom-7 left-0 z-50">
      <CommandPrimitive
        shouldFilter={false}
        className="contents"
        label="Search links"
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4">
          <div />

          <SearchTrigger
            inputRef={inputRef}
            active={mode === "search"}
            value={query}
            onValueChange={setQuery}
            onActivate={openSearch}
          />

          <div className="relative justify-self-start pl-2">
            <AgentTrigger active={mode === "agent"} onClick={toggleAgent} />

            <MorphingPanel
              mode={mode}
              orgId={orgId}
              agentEverOpened={agentEverOpened}
              agentTextareaRef={agentTextareaRef}
              originMV={originMV}
              rightMV={rightMV}
              query={query}
              searchResults={searchResults}
              recentLinks={recentLinks}
              onSelect={handleSelect}
              onClose={dismiss}
            />
          </div>
        </div>
      </CommandPrimitive>
    </div>
  );
}
