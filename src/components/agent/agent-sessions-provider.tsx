import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import useSWR from "swr";

import type { ChatSession } from "@/cf-worker/chat-agent/sessions";
import { titleFromMessage } from "@/cf-worker/chat-agent/sessions";
import type { AssistantCreditStatus } from "@/cf-worker/chat-agent/usage";
import {
  chatSessionEndpoint,
  chatSessionsEndpoint,
  decodeChatSessionsResponse,
  fetchChatSessions,
} from "@/lib/chat-sessions-api";

const EMPTY_SESSIONS: readonly ChatSession[] = [];

/**
 * The session endpoints answer a failure with a specific, user-facing reason —
 * the chat limit, for instance, tells the reader to delete a chat first.
 * Prefer it over a status code, and fall back only when the body is unusable.
 */
const failureFor = async (
  response: Response,
  fallback: string
): Promise<Error> => {
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === "object" && "error" in body) {
    const message: unknown = (body as { error: unknown }).error;
    if (typeof message === "string" && message.length > 0) {
      return new Error(message);
    }
  }
  return new Error(`${fallback}: ${response.status}`);
};

interface AgentSessionsValue {
  readonly sessions: readonly ChatSession[];
  readonly assistantCredits: AssistantCreditStatus | undefined;
  readonly selectedSession: ChatSession | undefined;
  readonly isLoading: boolean;
  readonly error: Error | undefined;
  readonly selectSession: (agentName: string) => void;
  readonly showSessionList: () => void;
  readonly retrySessions: () => Promise<void>;
  readonly createSession: () => Promise<void>;
  readonly deleteSession: (agentName: string) => Promise<void>;
  readonly noteFirstMessage: (message: string) => void;
}

const AgentSessionsContext = createContext<AgentSessionsValue | null>(null);

export function AgentSessionsProvider({
  workspaceId,
  enabled,
  children,
}: {
  workspaceId: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const url = enabled ? chatSessionsEndpoint(workspaceId) : null;
  const { data, error, mutate } = useSWR(url, fetchChatSessions, {
    dedupingInterval: 30_000,
  });
  const [selectedAgentName, setSelectedAgentName] = useState<string>();
  const showSessionList = useCallback(() => {
    setSelectedAgentName(undefined);
    void mutate();
  }, [mutate]);
  const sessions = data?.sessions ?? EMPTY_SESSIONS;
  const selectedSession = sessions.find(
    (session) => session.agentName === selectedAgentName
  );

  const retrySessions = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const createSession = useCallback(async () => {
    const response = await fetch(chatSessionsEndpoint(workspaceId), {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) throw await failureFor(response, "Create chat failed");
    const result = await decodeChatSessionsResponse(await response.json());
    await mutate(result, { revalidate: false });
    setSelectedAgentName(result.sessions[0]?.agentName);
  }, [mutate, workspaceId]);

  const deleteSession = useCallback(
    async (agentName: string) => {
      const response = await fetch(
        chatSessionEndpoint(workspaceId, agentName),
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      if (!response.ok) throw await failureFor(response, "Delete chat failed");
      const result = await decodeChatSessionsResponse(await response.json());
      await mutate(result, { revalidate: false });
      setSelectedAgentName((selected) =>
        selected === agentName ? undefined : selected
      );
    },
    [mutate, workspaceId]
  );

  const noteFirstMessage = useCallback(
    (message: string) => {
      if (!selectedSession || selectedSession.title !== "New chat") return;
      const next = sessions.map((session) =>
        session.agentName === selectedSession.agentName
          ? {
              ...session,
              title: titleFromMessage(message),
              updatedAt: new Date().toISOString(),
            }
          : session
      );
      void mutate(
        { sessions: next, assistantCredits: data?.assistantCredits },
        { revalidate: false }
      );
    },
    [data?.assistantCredits, mutate, selectedSession, sessions]
  );

  const value = useMemo<AgentSessionsValue>(
    () => ({
      sessions,
      assistantCredits: data?.assistantCredits,
      selectedSession,
      isLoading: data === undefined && error === undefined,
      error,
      selectSession: setSelectedAgentName,
      showSessionList,
      retrySessions,
      createSession,
      deleteSession,
      noteFirstMessage,
    }),
    [
      sessions,
      selectedSession,
      data,
      error,
      showSessionList,
      retrySessions,
      createSession,
      deleteSession,
      noteFirstMessage,
    ]
  );

  return (
    <AgentSessionsContext.Provider value={value}>
      {children}
    </AgentSessionsContext.Provider>
  );
}

export function useAgentSessions(): AgentSessionsValue {
  const value = useContext(AgentSessionsContext);
  if (!value) {
    throw new Error(
      "useAgentSessions must be used inside <AgentSessionsProvider>"
    );
  }
  return value;
}

export function useAgentSessionsOptional(): AgentSessionsValue | null {
  return useContext(AgentSessionsContext);
}
