"use client";

import { Command as CommandPrimitive } from "cmdk";
import { Match } from "effect";
import { animate, useMotionValue } from "motion/react";
import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import type { ReactNode, RefObject } from "react";

import {
  AgentChatProvider,
  AgentConnectionProvider,
  AgentInputProvider,
  hasPendingToolApproval,
  useAgentChatOptional,
} from "@/components/agent/agent-chat-provider";
import {
  AgentSessionsProvider,
  useAgentSessions,
  useAgentSessionsOptional,
} from "@/components/agent/agent-sessions-provider";
import { useHotkeyScope } from "@/hooks/use-hotkey-scope";
import { useNarrowViewport } from "@/hooks/use-narrow-viewport";
import { useOrgFeatures } from "@/hooks/use-org-features";
import { useRecentLinks } from "@/hooks/use-recent-links";
import { useTrackLinkOpen } from "@/hooks/use-track-link-open";
import { track } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import { useCommand, useDismiss } from "@/lib/keyboard";
import { searchLinks$ } from "@/livestore/queries/links";
import type { LinkWithDetails, SearchResult } from "@/livestore/queries/links";
import { useAppStore, useStoreQuery } from "@/livestore/store";
import { useDockStore } from "@/stores/dock-store";
import { useRightPaneStore } from "@/stores/right-pane-store";

import { AgentTrigger } from "./agent-trigger";
import type { AgentSurfaceState } from "./dock-content";
import { MobileDockSheet } from "./mobile-dock-sheet";
import { MorphingPanel } from "./morphing-panel";
import { SearchTrigger } from "./search-trigger";
import { SearchTriggerButton } from "./search-trigger-button";

function useOutsideClick(
  rootRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  active: boolean
) {
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

export function BottomDockSurface({
  search,
  agent,
}: {
  search: ReactNode;
  agent: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-4 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-0">
      <div className="hidden lg:block" />
      {search}
      <div className="relative shrink-0 lg:justify-self-start lg:pl-2">
        {agent}
      </div>
    </div>
  );
}

export function BottomDock() {
  const { orgId } = useAuth();
  const agentEverOpened = useDockStore((s) => s.agentEverOpened);
  const agentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { isLoading: isLoadingFeatures, isChatEnabled } = useOrgFeatures();

  const featureState = Match.value({
    orgId,
    isLoadingFeatures,
    isChatEnabled,
    agentEverOpened,
  }).pipe(
    Match.when(
      (state) => state.orgId === null,
      () => "hidden" as const
    ),
    Match.when(
      (state) => state.isLoadingFeatures,
      () => "features-loading" as const
    ),
    Match.when(
      (state) => !state.isChatEnabled,
      () => "promo" as const
    ),
    Match.when(
      (state) => !state.agentEverOpened,
      () => "dormant" as const
    ),
    Match.orElse(() => "ready" as const)
  ) satisfies AgentSurfaceState;

  if (!orgId || isLoadingFeatures || !isChatEnabled) {
    return (
      <BottomDockInner
        agentTextareaRef={agentTextareaRef}
        featureState={featureState}
      />
    );
  }

  return (
    <AgentSessionsProvider workspaceId={orgId} enabled>
      <BottomDockWithSessions
        agentTextareaRef={agentTextareaRef}
        featureState={featureState}
        workspaceId={orgId}
      />
    </AgentSessionsProvider>
  );
}

function BottomDockWithSessions({
  agentTextareaRef,
  featureState,
  workspaceId,
}: {
  agentTextareaRef: RefObject<HTMLTextAreaElement | null>;
  featureState: AgentSurfaceState;
  workspaceId: string;
}) {
  const { selectedSession } = useAgentSessions();
  const dock = (
    <BottomDockInner
      agentTextareaRef={agentTextareaRef}
      featureState={featureState}
    />
  );

  if (featureState !== "ready" || !selectedSession) return dock;

  return (
    <AgentConnectionProvider
      key={selectedSession.agentName}
      workspaceId={workspaceId}
      agentName={selectedSession.agentName}
    >
      <AgentInputProvider textareaRef={agentTextareaRef}>
        <Suspense fallback={dock}>
          <AgentChatProvider>{dock}</AgentChatProvider>
        </Suspense>
      </AgentInputProvider>
    </AgentConnectionProvider>
  );
}

function BottomDockInner({
  agentTextareaRef,
  featureState,
}: {
  agentTextareaRef: RefObject<HTMLTextAreaElement | null>;
  featureState: AgentSurfaceState;
}) {
  const mode = useDockStore((s) => s.mode);
  const setMode = useDockStore((s) => s.setMode);
  const close = useDockStore((s) => s.close);
  const query = useDockStore((s) => s.query);
  const setQuery = useDockStore((s) => s.setQuery);
  const isNarrow = useNarrowViewport();
  const chat = useAgentChatOptional();
  const sessions = useAgentSessionsOptional();
  const hasPendingAgentApproval = chat
    ? hasPendingToolApproval(chat.messages)
    : false;
  const agentState: AgentSurfaceState =
    featureState === "ready" && Boolean(sessions?.selectedSession) && !chat
      ? "connecting"
      : featureState;

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const originMV = useMotionValue<string>(
    mode === "agent" ? "bottom right" : "bottom"
  );
  const rightMV = useMotionValue<number>(mode === "agent" ? 0 : 48);

  const openAgent = useCallback(() => {
    originMV.set("bottom right");
    if (mode === "closed") {
      rightMV.set(0);
    } else {
      animate(rightMV, 0, { type: "spring", bounce: 0, duration: 0.32 });
    }
    setMode("agent");
    if (!isNarrow) {
      requestAnimationFrame(() => agentTextareaRef.current?.focus());
    }
  }, [mode, originMV, rightMV, setMode, isNarrow, agentTextareaRef]);

  const openSearch = useCallback(() => {
    originMV.set("bottom");
    if (mode === "closed") {
      rightMV.set(48);
    } else {
      animate(rightMV, 48, { type: "spring", bounce: 0, duration: 0.32 });
    }
    setMode("search");
    if (!isNarrow) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [mode, originMV, rightMV, setMode, isNarrow]);

  const toggleAgent = useCallback(() => {
    if (mode === "agent") {
      setMode("closed");
      return;
    }
    openAgent();
  }, [mode, setMode, openAgent]);

  const store = useAppStore();
  const searchQuery = useMemo(() => searchLinks$(query.trim()), [query]);
  const searchResults = useStoreQuery(store, searchQuery);
  const recentLinks = useRecentLinks();

  const openDetail = useRightPaneStore((s) => s.openDetail);
  const trackLinkOpen = useTrackLinkOpen();

  const dismiss = useCallback(() => {
    if (rootRef.current?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
    close();
  }, [close]);

  useHotkeyScope("dock", { enabled: mode !== "closed" });
  useOutsideClick(rootRef, dismiss, mode !== "closed" && !isNarrow);
  useDismiss("dock", dismiss);

  const handleSelect = useCallback(
    (link: LinkWithDetails | SearchResult) => {
      dismiss();
      trackLinkOpen(link.id);
      openDetail(link.id);
    },
    [dismiss, openDetail, trackLinkOpen]
  );

  useCommand("openDock", () => {
    if (mode === "search") {
      dismiss();
      return;
    }
    openSearch();
    track("search_used");
  });

  useCommand("openAgent", toggleAgent);

  return (
    <div ref={rootRef} className="relative w-full">
      <CommandPrimitive
        shouldFilter={false}
        className="contents"
        label="Search links"
      >
        <BottomDockSurface
          search={
            isNarrow ? (
              <SearchTriggerButton
                active={mode === "search"}
                onActivate={openSearch}
              />
            ) : (
              <SearchTrigger
                inputRef={inputRef}
                active={mode === "search"}
                value={query}
                onValueChange={setQuery}
                onActivate={openSearch}
              />
            )
          }
          agent={
            <>
              <AgentTrigger
                active={mode === "agent"}
                attention={hasPendingAgentApproval && mode !== "agent"}
                onClick={toggleAgent}
              />

              {isNarrow ? null : (
                <MorphingPanel
                  mode={mode}
                  agentState={agentState}
                  originMV={originMV}
                  rightMV={rightMV}
                  query={query}
                  searchResults={searchResults}
                  recentLinks={recentLinks}
                  onSelect={handleSelect}
                />
              )}
            </>
          }
        />
      </CommandPrimitive>

      {isNarrow ? (
        <MobileDockSheet
          mode={mode}
          setMode={setMode}
          query={query}
          setQuery={setQuery}
          searchResults={searchResults}
          recentLinks={recentLinks}
          onSelect={handleSelect}
          agentState={agentState}
          onDismiss={dismiss}
        />
      ) : null}
    </div>
  );
}
