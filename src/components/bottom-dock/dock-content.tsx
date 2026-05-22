import { AnimatePresence, motion } from "motion/react";
import { Suspense, useRef, useState } from "react";
import type { RefObject } from "react";

import {
  AgentChatProvider,
  AgentConnectionProvider,
  AgentInputProvider,
} from "@/components/agent/agent-chat-provider";
import { AgentHeader } from "@/components/agent/agent-header";
import { InputForm } from "@/components/agent/agent-input";
import { AgentPanel } from "@/components/agent/agent-panel";
import { AgentPlaceholderPanel } from "@/components/agent/agent-placeholder-panel";
import { AgentSkeleton } from "@/components/agent/agent-skeleton";
import { useOrgFeatures } from "@/hooks/use-org-features";
import type { LinkWithDetails, SearchResult } from "@/livestore/queries/links";
import type { DockMode } from "@/stores/dock-store";

import { SearchContent } from "./search-content";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN = [0.4, 0, 1, 1] as const;

type DisplayMode = "search" | "agent";

interface DockContentProps {
  mode: DockMode;
  query: string;
  searchResults: readonly SearchResult[];
  recentLinks: readonly LinkWithDetails[];
  onSelect: (link: LinkWithDetails | SearchResult) => void;
  orgId: string | null;
  agentEverOpened: boolean;
  agentTextareaRef: RefObject<HTMLTextAreaElement | null>;
  onClose: () => void;
}

// Each shell supplies its own search input + `CommandPrimitive` — cmdk context
// doesn't cross the mobile sheet's portal.
export function DockContent({
  mode,
  query,
  searchResults,
  recentLinks,
  onSelect,
  orgId,
  agentEverOpened,
  agentTextareaRef,
  onClose,
}: DockContentProps) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>(
    mode === "agent" ? "agent" : "search"
  );
  const prevModeRef = useRef<DockMode>(mode);
  const sessionRef = useRef(0);

  let nextDisplayMode = displayMode;

  if (mode !== prevModeRef.current) {
    if (mode === "search" || mode === "agent") {
      nextDisplayMode = mode;
      if (mode !== displayMode) {
        setDisplayMode(mode);
      }
      if (prevModeRef.current === "closed") {
        sessionRef.current++;
      }
    }
    prevModeRef.current = mode;
  }

  const sessionKey = sessionRef.current;

  const { isLoading: isLoadingFeatures, isChatEnabled } = useOrgFeatures();

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
      key={sessionKey}
      displayMode={nextDisplayMode}
      searchSlot={searchSlot}
      agentSlot={agentSlot}
    />
  );

  let content: React.ReactNode;
  if (!orgId || isLoadingFeatures) {
    content = renderSwitcher(
      orgId ? <AgentPlaceholderPanel variant="loading" /> : null
    );
  } else if (!isChatEnabled) {
    content = renderSwitcher(<AgentPlaceholderPanel variant="promo" />);
  } else if (!agentEverOpened) {
    content = renderSwitcher(null);
  } else {
    content = (
      <AgentConnectionProvider workspaceId={orgId}>
        <AgentInputProvider textareaRef={agentTextareaRef}>
          <Suspense fallback={<SkeletonAgentPanel onClose={onClose} />}>
            <AgentChatProvider>
              {renderSwitcher(<AgentPanel onClose={onClose} />)}
            </AgentChatProvider>
          </Suspense>
        </AgentInputProvider>
      </AgentConnectionProvider>
    );
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

function SkeletonAgentPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <AgentHeader onClose={onClose} />
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
