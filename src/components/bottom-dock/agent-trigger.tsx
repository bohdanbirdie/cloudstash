import { MessageCircleIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { getHotkeyLabel } from "@/lib/hotkey-label";
import { cn } from "@/lib/utils";

const HOTKEY_LABEL = getHotkeyLabel("meta+j");

interface AgentTriggerProps {
  active: boolean;
  attention?: boolean;
  onClick: () => void;
}

export function AgentTrigger({
  active,
  attention = false,
  onClick,
}: AgentTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        attention
          ? `Assistant, confirmation required (${HOTKEY_LABEL})`
          : `Assistant (${HOTKEY_LABEL})`
      }
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center rounded-full border bg-background text-foreground shadow-sm transition-[colors,scale] active:scale-[0.96] hover:z-10 hover:bg-muted",
        { "z-10 border-primary/40": active, "border-border": !active }
      )}
    >
      <MessageCircleIcon
        className="size-4 text-muted-foreground"
        strokeWidth={1.75}
      />
      <AnimatePresence initial={false}>
        {attention && (
          <motion.span
            aria-hidden="true"
            initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            className="pointer-events-none absolute -end-0.5 -top-0.5 size-2.5 rounded-full bg-destructive ring-2 ring-background"
          />
        )}
      </AnimatePresence>
    </button>
  );
}
