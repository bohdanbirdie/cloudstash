import { useRef } from "react";
import type { ReactNode } from "react";

import { ChatContainerContext } from "@/components/chat/chat-container-context";

import { AgentHeader } from "./agent-header";
import { AgentInput } from "./agent-input";
import { AgentMessages } from "./agent-messages";

export function AgentPanel() {
  return (
    <AgentPanelSurface
      header={<AgentHeader />}
      messages={<AgentMessages />}
      input={<AgentInput />}
    />
  );
}

export function AgentPanelSurface({
  header,
  messages,
  input,
}: {
  header: ReactNode;
  messages: ReactNode;
  input: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <ChatContainerContext.Provider value={containerRef}>
      <div ref={containerRef} className="flex h-full flex-col">
        {header}
        {messages}
        {input}
      </div>
    </ChatContainerContext.Provider>
  );
}
