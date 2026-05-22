import { motion } from "motion/react";
import type { MotionValue } from "motion/react";
import type { RefObject } from "react";

import type { LinkWithDetails, SearchResult } from "@/livestore/queries/links";
import type { DockMode } from "@/stores/dock-store";

import { DockContent } from "./dock-content";

const POPUP_CLASS =
  "absolute bottom-full mb-2 h-[480px] w-[min(480px,calc(100vw-1.5rem))] overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-[0_0_0_1px_rgb(0_0_0_/_0.05),0_2px_6px_-1px_rgb(0_0_0_/_0.06),0_18px_44px_-10px_rgb(0_0_0_/_0.2)] dark:shadow-[0_0_0_1px_rgb(255_255_255_/_0.06),0_2px_6px_-1px_rgb(0_0_0_/_0.4),0_18px_44px_-10px_rgb(0_0_0_/_0.65)]";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN = [0.4, 0, 1, 1] as const;

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
  const isOpen = mode !== "closed";

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
      <DockContent
        mode={mode}
        query={query}
        searchResults={searchResults}
        recentLinks={recentLinks}
        onSelect={onSelect}
        orgId={orgId}
        agentEverOpened={agentEverOpened}
        agentTextareaRef={agentTextareaRef}
        onClose={onClose}
      />
    </motion.div>
  );
}
