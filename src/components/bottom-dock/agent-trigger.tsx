import { SparklesIcon } from "lucide-react";

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
        "flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/10 bg-popover text-foreground shadow-[0_1px_2px_rgb(61_40_20_/_0.08),0_10px_28px_-8px_rgb(61_40_20_/_0.24)] transition-[colors,scale] active:scale-[0.96] hover:bg-muted dark:border-border dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.3),0_10px_28px_-8px_rgb(0_0_0_/_0.6)]",
        active && "border-primary/25"
      )}
    >
      <SparklesIcon
        className="size-4 text-muted-foreground"
        strokeWidth={1.75}
      />
    </button>
  );
}
