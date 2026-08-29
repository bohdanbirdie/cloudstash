import type { ChatSession } from "@/cf-worker/chat-agent/sessions";
import type { AssistantCreditStatus } from "@/cf-worker/chat-agent/usage";

export interface ChatSessionsResponse {
  readonly sessions: readonly ChatSession[];
  readonly assistantCredits?: AssistantCreditStatus;
}

export const chatSessionsEndpoint = (workspaceId: string) =>
  `/api/chat/sessions?workspaceId=${encodeURIComponent(workspaceId)}`;

export const chatSessionEndpoint = (workspaceId: string, agentName: string) =>
  `/api/chat/sessions/${encodeURIComponent(agentName)}?workspaceId=${encodeURIComponent(workspaceId)}`;

export async function fetchChatSessions(
  url: string
): Promise<ChatSessionsResponse> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`Chat sessions failed: ${response.status}`);
  return response.json<ChatSessionsResponse>();
}
