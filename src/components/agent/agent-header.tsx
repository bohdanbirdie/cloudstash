import { SparklesIcon, XIcon } from "lucide-react";

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
    <header className="flex h-7 shrink-0 items-center justify-between border-b border-border px-2">
      <div className="flex items-center gap-1">
        <SparklesIcon className="size-3 text-primary" />
        <span className="text-xs font-medium">Assistant</span>
        {!isConnected && (
          <span className="size-1.5 animate-pulse rounded-full bg-yellow-500" />
        )}
        {usage && (
          <div className="ml-1">
            <UsageIndicator usage={usage} onClear={clearHistory} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        <AgentHelpHint />
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onClose}
          aria-label="Close"
          className="size-5 text-muted-foreground hover:text-foreground [&_svg:not([class*='size-'])]:size-3"
        >
          <XIcon />
        </Button>
      </div>
    </header>
  );
}
