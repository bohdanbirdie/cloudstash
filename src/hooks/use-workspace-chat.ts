import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { useState } from "react";

import { TOOLS_REQUIRING_CONFIRMATION } from "@/shared/tool-config";

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

  const { messages, sendMessage, clearHistory, status, addToolOutput, error } =
    useAgentChat({
      agent,
      credentials: "include",
      toolsRequiringConfirmation: [...TOOLS_REQUIRING_CONFIRMATION],
    });

  return {
    messages,
    sendMessage,
    clearHistory,
    status,
    isConnected,
    addToolOutput,
    error,
  };
}
