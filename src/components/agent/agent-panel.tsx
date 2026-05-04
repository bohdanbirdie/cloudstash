import { useRef } from "react";

import { ChatContainerContext } from "@/components/chat/chat-container-context";

import { AgentHeader } from "./agent-header";
import { AgentInput } from "./agent-input";
import { AgentMessages } from "./agent-messages";

interface AgentPanelProps {
  onClose: () => void;
}

export function AgentPanel({ onClose }: AgentPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <ChatContainerContext.Provider value={containerRef}>
      <div ref={containerRef} className="flex h-full flex-col">
        <AgentHeader onClose={onClose} />
        <AgentMessages />
        <AgentInput />
      </div>
    </ChatContainerContext.Provider>
  );
}
