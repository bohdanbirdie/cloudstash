import { useAgentChat as useSdkAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode, RefObject } from "react";

import type { ChatAgentState } from "@/cf-worker/chat-agent/usage";
import { useNarrowViewport } from "@/hooks/use-narrow-viewport";
import { TOOLS_REQUIRING_CONFIRMATION } from "@/shared/tool-config";

type Agent = ReturnType<typeof useAgent<ChatAgentState>>;

interface AgentConnectionValue {
  agent: Agent;
  isConnected: boolean;
  usage: ChatAgentState["usage"];
}

const AgentConnectionContext = createContext<AgentConnectionValue | null>(null);

export function useAgentConnection(): AgentConnectionValue {
  const ctx = useContext(AgentConnectionContext);
  if (!ctx)
    throw new Error(
      "useAgentConnection must be used inside <AgentConnectionProvider>"
    );
  return ctx;
}

export function AgentConnectionProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const [isConnected, setIsConnected] = useState(false);

  const agent = useAgent<ChatAgentState>({
    agent: "chat",
    name: workspaceId,
    onOpen: () => setIsConnected(true),
    onClose: () => setIsConnected(false),
  });

  const usage = agent.state?.usage;
  const value = useMemo<AgentConnectionValue>(
    () => ({ agent, isConnected, usage }),
    [agent, isConnected, usage]
  );

  return (
    <AgentConnectionContext.Provider value={value}>
      {children}
    </AgentConnectionContext.Provider>
  );
}

type SdkChat = ReturnType<typeof useSdkAgentChat>;

interface AgentChatValue {
  messages: SdkChat["messages"];
  status: SdkChat["status"];
  error: SdkChat["error"];
  sendMessage: SdkChat["sendMessage"];
  clearHistory: SdkChat["clearHistory"];
  addToolOutput: SdkChat["addToolOutput"];
}

const AgentChatContext = createContext<AgentChatValue | null>(null);

export function useAgentChat(): AgentChatValue {
  const ctx = useContext(AgentChatContext);
  if (!ctx)
    throw new Error("useAgentChat must be used inside <AgentChatProvider>");
  return ctx;
}

export function useAgentChatOptional(): AgentChatValue | null {
  return useContext(AgentChatContext);
}

export function AgentChatProvider({ children }: { children: ReactNode }) {
  const { agent } = useAgentConnection();

  const chat = useSdkAgentChat({
    agent,
    credentials: "include",
    toolsRequiringConfirmation: [...TOOLS_REQUIRING_CONFIRMATION],
    autoContinueAfterToolResult: true,
  });

  const value = useMemo<AgentChatValue>(
    () => ({
      messages: chat.messages,
      status: chat.status,
      error: chat.error,
      sendMessage: chat.sendMessage,
      clearHistory: chat.clearHistory,
      addToolOutput: chat.addToolOutput,
    }),
    [
      chat.messages,
      chat.status,
      chat.error,
      chat.sendMessage,
      chat.clearHistory,
      chat.addToolOutput,
    ]
  );

  return (
    <AgentChatContext.Provider value={value}>
      {children}
    </AgentChatContext.Provider>
  );
}

export interface TextareaSelection {
  start: number;
  end: number;
}

interface AgentInputValue {
  draft: string;
  setDraft: (value: string) => void;
  selectionRef: RefObject<TextareaSelection>;
  setupTextarea: (node: HTMLTextAreaElement | null) => void;
}

const AgentInputContext = createContext<AgentInputValue | null>(null);

export function useAgentInput(): AgentInputValue {
  const ctx = useContext(AgentInputContext);
  if (!ctx)
    throw new Error("useAgentInput must be used inside <AgentInputProvider>");
  return ctx;
}

export function AgentInputProvider({
  textareaRef,
  children,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const selectionRef = useRef<TextareaSelection>({ start: 0, end: 0 });

  const isNarrow = useNarrowViewport();

  const setupTextarea = useCallback(
    (node: HTMLTextAreaElement | null) => {
      textareaRef.current = node;
      if (!node) return;
      const { start, end } = selectionRef.current;
      node.setSelectionRange(start, end);
      if (!isNarrow) node.focus();
    },
    [textareaRef, isNarrow]
  );

  const value = useMemo<AgentInputValue>(
    () => ({ draft, setDraft, selectionRef, setupTextarea }),
    [draft, setupTextarea]
  );

  return (
    <AgentInputContext.Provider value={value}>
      {children}
    </AgentInputContext.Provider>
  );
}
