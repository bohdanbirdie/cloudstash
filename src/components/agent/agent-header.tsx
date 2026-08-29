import { MessageCircleIcon } from "lucide-react";

import { UsageIndicator } from "@/components/chat/chat-content/usage-indicator";
import { Spinner } from "@/components/ui/spinner";

import {
  useAgentChatOptional,
  useAgentConnection,
} from "./agent-chat-provider";
import { AgentHelpHint } from "./agent-help-hint";

export function AgentHeader() {
  const { isConnected, usage } = useAgentConnection();
  const chat = useAgentChatOptional();
  const clearHistory = chat?.clearHistory;

  return (
    <AgentHeaderView
      isConnected={isConnected}
      usage={usage}
      onClear={clearHistory}
    />
  );
}

export function AgentHeaderView({
  isConnected,
  usage,
  onClear,
}: {
  isConnected: boolean;
  usage?: { used: number; limit: number; budget: number };
  onClear?: () => void;
}) {
  return (
    <header className="flex h-8 shrink-0 items-center justify-between border-b border-border px-2">
      <div className="flex min-w-0 items-center gap-1">
        <MessageCircleIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-primary"
        />
        <span className="truncate text-xs font-medium">Assistant</span>
        {!isConnected && (
          <Spinner
            aria-label="Connecting to assistant"
            className="size-3 text-muted-foreground"
          />
        )}
        {usage && (
          <div className="ms-1">
            <UsageIndicator usage={usage} onClear={onClear} />
          </div>
        )}
      </div>
      <AgentHelpHint />
    </header>
  );
}
