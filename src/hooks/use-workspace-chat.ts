import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { useState } from "react";

export function useWorkspaceChat(workspaceId: string) {
  const [isConnected, setIsConnected] = useState(false);

  const agent = useAgent({
    // Must match wrangler.toml binding "Chat" (SDK capitalizes)
    agent: "chat",
    name: workspaceId,
    onOpen: () => {
      setIsConnected(true);
    },
    onClose: () => {
      setIsConnected(false);
    },
  });

  const { messages, sendMessage, clearHistory, status } = useAgentChat({
    agent,
    credentials: "include",
  });

  return {
    messages,
    sendMessage,
    clearHistory,
    status,
    isConnected,
  };
}
