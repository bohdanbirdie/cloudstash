import { MessageCircleIcon } from "lucide-react";

import { getHotkeyLabel } from "@/lib/hotkey-label";
import { cn } from "@/lib/utils";

const HOTKEY_LABEL = getHotkeyLabel("meta+j");

interface AgentTriggerProps {
  active: boolean;
  onClick: () => void;
}

export function AgentTrigger({ active, onClick }: AgentTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Agent (${HOTKEY_LABEL})`}
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center rounded-full border bg-background text-foreground shadow-sm transition-[colors,scale] active:scale-[0.96] hover:z-10 hover:bg-muted",
        { "z-10 border-primary/40": active, "border-border": !active }
      )}
    >
      <MessageCircleIcon
        className="size-4 text-muted-foreground"
        strokeWidth={1.75}
      />
    </button>
  );
}
