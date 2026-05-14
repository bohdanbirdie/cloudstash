import { MessageCircleIcon, XIcon } from "lucide-react";

import { UsageIndicator } from "@/components/chat/chat-content/usage-indicator";
import { Button } from "@/components/ui/button";

import {
  useAgentChatOptional,
  useAgentConnection,
} from "./agent-chat-provider";
import { AgentHelpHint } from "./agent-help-hint";

interface AgentHeaderProps {
  onClose: () => void;
}

export function AgentHeader({ onClose }: AgentHeaderProps) {
  const { isConnected, usage } = useAgentConnection();
  const chat = useAgentChatOptional();
  const clearHistory = chat?.clearHistory;

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3 lg:h-7 lg:px-2">
      <div className="flex items-center gap-1.5 lg:gap-1">
        <MessageCircleIcon className="size-4 text-primary lg:size-3" />
        <span className="text-sm font-medium lg:text-xs">Assistant</span>
        {!isConnected && (
          <span className="size-2 animate-pulse rounded-full bg-yellow-500 lg:size-1.5" />
        )}
        {usage && (
          <div className="ml-1.5 lg:ml-1">
            <UsageIndicator usage={usage} onClear={clearHistory} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 lg:gap-0.5">
        <AgentHelpHint />
        {/* The mobile sheet dismisses via drag / backdrop, so the explicit
            close button is desktop-only. */}
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onClose}
          aria-label="Close"
          className="hidden size-5 text-muted-foreground hover:text-foreground lg:inline-flex [&_svg:not([class*='size-'])]:size-3"
        >
          <XIcon />
        </Button>
      </div>
    </header>
  );
}
