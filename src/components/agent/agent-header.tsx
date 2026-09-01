import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { useAgentConnection } from "./agent-chat-provider";
import { useAgentSessionsOptional } from "./agent-sessions-provider";

export function AgentHeader() {
  const { isConnected } = useAgentConnection();
  const sessionState = useAgentSessionsOptional();

  return (
    <AgentHeaderView
      isConnected={isConnected}
      title={sessionState?.selectedSession?.title}
      onBack={sessionState?.showSessionList}
    />
  );
}

export function AgentHeaderView({
  isConnected = true,
  title = "Cloudstash Assistant",
  onBack,
}: {
  isConnected?: boolean;
  title?: string;
  onBack?: () => void;
}) {
  return (
    <header className="flex h-8 shrink-0 items-center justify-between border-b border-border px-1.5">
      <div className="flex min-w-0 items-center gap-0.5">
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Back to chats"
            onClick={onBack}
          >
            <ArrowLeftIcon />
          </Button>
        )}
        <span className="truncate px-1 text-xs font-medium">{title}</span>
        {!isConnected && (
          <Spinner
            aria-label="Connecting to assistant"
            className="size-3 text-muted-foreground"
          />
        )}
      </div>
    </header>
  );
}
