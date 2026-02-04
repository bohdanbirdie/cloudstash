import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { useState } from "react";

import { type ChatAgentState } from "@/cf-worker/chat-agent/usage";
import { TOOLS_REQUIRING_CONFIRMATION } from "@/shared/tool-config";

export function useWorkspaceChat(workspaceId: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [usage, setUsage] = useState<ChatAgentState["usage"]>();

  const agent = useAgent<ChatAgentState>({
    // Must match wrangler.toml binding "Chat" (SDK capitalizes)
    agent: "chat",
    name: workspaceId,
    onOpen: () => {
      setIsConnected(true);
    },
    onClose: () => {
      setIsConnected(false);
    },
    onStateUpdate: (state) => {
      if (state?.usage) setUsage(state.usage);
    },
  });

  const { messages, sendMessage, clearHistory, status, addToolOutput, error } =
    useAgentChat({
      agent,
      credentials: "include",
      toolsRequiringConfirmation: [...TOOLS_REQUIRING_CONFIRMATION],
      autoContinueAfterToolResult: true,
    });

  return {
    messages,
    sendMessage,
    clearHistory,
    status,
    isConnected,
    addToolOutput,
    error,
    usage,
  };
}
