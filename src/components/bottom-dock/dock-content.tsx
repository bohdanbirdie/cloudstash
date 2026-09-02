import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { AgentHeaderView } from "@/components/agent/agent-header";
import { InputForm } from "@/components/agent/agent-input";
import { AgentPanel } from "@/components/agent/agent-panel";
import { AgentPlaceholderPanel } from "@/components/agent/agent-placeholder-panel";
import { useAgentSessions } from "@/components/agent/agent-sessions-provider";
import { AgentSkeleton } from "@/components/agent/agent-skeleton";
import type { LinkWithDetails, SearchResult } from "@/livestore/queries/links";
import type { DockMode } from "@/stores/dock-store";

import { SearchContent } from "./search-content";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN = [0.4, 0, 1, 1] as const;

type DisplayMode = "search" | "agent";
export type AgentSurfaceState =
  | "hidden"
  | "features-loading"
  | "promo"
  | "dormant"
  | "connecting"
  | "ready";

interface DockContentProps {
  mode: DockMode;
  query: string;
  searchResults: readonly SearchResult[];
  recentLinks: readonly LinkWithDetails[];
  onSelect: (link: LinkWithDetails | SearchResult) => void;
  agentState: AgentSurfaceState;
}

// Each shell supplies its own search input + `CommandPrimitive` — cmdk context
// doesn't cross the mobile sheet's portal.
export function DockContent({
  mode,
  query,
  searchResults,
  recentLinks,
  onSelect,
  agentState,
}: DockContentProps) {
  const [display, setDisplay] = useState(() => ({
    mode,
    displayMode: (mode === "agent" ? "agent" : "search") as DisplayMode,
    sessionKey: 0,
  }));

  if (mode !== display.mode) {
    const isVisible = mode === "search" || mode === "agent";
    setDisplay({
      mode,
      displayMode: isVisible ? mode : display.displayMode,
      sessionKey:
        isVisible && display.mode === "closed"
          ? display.sessionKey + 1
          : display.sessionKey,
    });
  }

  const searchSlot = (
    <SearchContent
      query={query.trim()}
      searchResults={searchResults}
      recentLinks={recentLinks}
      onSelect={onSelect}
    />
  );

  const renderSwitcher = (agentSlot: React.ReactNode) => (
    <ContentSwitcher
      key={display.sessionKey}
      displayMode={display.displayMode}
      searchSlot={searchSlot}
      agentSlot={agentSlot}
    />
  );

  let content: React.ReactNode;
  switch (agentState) {
    case "hidden":
    case "dormant":
      content = renderSwitcher(null);
      break;
    case "features-loading":
      content = renderSwitcher(<AgentPlaceholderPanel variant="loading" />);
      break;
    case "promo":
      content = renderSwitcher(<AgentPlaceholderPanel variant="promo" />);
      break;
    case "connecting":
      content = renderSwitcher(<SkeletonAgentPanel />);
      break;
    case "ready":
      content = renderSwitcher(<AgentPanel />);
      break;
  }

  return <div className="relative h-full overflow-hidden">{content}</div>;
}

function ContentSwitcher({
  displayMode,
  searchSlot,
  agentSlot,
}: {
  displayMode: DisplayMode;
  searchSlot: React.ReactNode;
  agentSlot: React.ReactNode;
}) {
  const direction: "right" | "left" =
    displayMode === "agent" ? "right" : "left";

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={displayMode}
        initial={{ opacity: 0, x: direction === "right" ? 28 : -28 }}
        animate={{
          opacity: 1,
          x: 0,
          transition: {
            opacity: { duration: 0.26, ease: EASE_OUT, delay: 0.06 },
            x: { type: "spring", bounce: 0, duration: 0.32 },
          },
        }}
        exit={{
          opacity: 0,
          x: direction === "right" ? -28 : 28,
          transition: {
            opacity: { duration: 0.08, ease: EASE_IN },
            x: { type: "spring", bounce: 0, duration: 0.18 },
          },
        }}
        className="absolute inset-0"
      >
        {displayMode === "search" ? searchSlot : agentSlot}
      </motion.div>
    </AnimatePresence>
  );
}

function SkeletonAgentPanel() {
  const { selectedSession, showSessionList } = useAgentSessions();

  return (
    <div className="flex h-full flex-col">
      <AgentHeaderView
        title={selectedSession?.title}
        onBack={showSessionList}
      />
      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3">
        <AgentSkeleton />
      </div>
      <InputForm
        onSubmit={() => {}}
        canSend={false}
        placeholder="Ask about your links..."
      />
    </div>
  );
}
