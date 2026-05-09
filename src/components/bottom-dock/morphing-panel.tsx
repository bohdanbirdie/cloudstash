import { AnimatePresence, motion } from "motion/react";
import type { MotionValue } from "motion/react";
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

const POPUP_CLASS =
  "absolute bottom-full mb-2 h-[480px] w-[480px] overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-[0_0_0_1px_rgb(0_0_0_/_0.05),0_2px_6px_-1px_rgb(0_0_0_/_0.06),0_18px_44px_-10px_rgb(0_0_0_/_0.2)] dark:shadow-[0_0_0_1px_rgb(255_255_255_/_0.06),0_2px_6px_-1px_rgb(0_0_0_/_0.4),0_18px_44px_-10px_rgb(0_0_0_/_0.65)]";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN = [0.4, 0, 1, 1] as const;

type DisplayMode = "search" | "agent";

interface MorphingPanelProps {
  mode: DockMode;
  orgId: string | null;
  agentEverOpened: boolean;
  agentTextareaRef: RefObject<HTMLTextAreaElement | null>;
  originMV: MotionValue<string>;
  rightMV: MotionValue<number>;
  query: string;
  searchResults: readonly SearchResult[];
  recentLinks: readonly LinkWithDetails[];
  onSelect: (link: LinkWithDetails | SearchResult) => void;
  onClose: () => void;
}

export function MorphingPanel({
  mode,
  orgId,
  agentEverOpened,
  agentTextareaRef,
  originMV,
  rightMV,
  query,
  searchResults,
  recentLinks,
  onSelect,
  onClose,
}: MorphingPanelProps) {
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

  const isOpen = mode !== "closed";
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

  return (
    <motion.div
      initial={false}
      animate={{
        opacity: isOpen ? 1 : 0,
        scale: isOpen ? 1 : 0.95,
      }}
      transition={{
        opacity: {
          duration: isOpen ? 0.24 : 0.14,
          ease: isOpen ? EASE_OUT : EASE_IN,
        },
        scale: { type: "spring", bounce: 0, duration: 0.28 },
      }}
      style={{
        transformOrigin: originMV,
        right: rightMV,
        pointerEvents: isOpen ? "auto" : "none",
      }}
      className={POPUP_CLASS}
    >
      {content}
    </motion.div>
  );
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
