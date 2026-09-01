import { Option, Schema } from "effect";

import { ChatSessionRegistry } from "@/cf-worker/chat-agent/sessions";
import { AssistantCreditStatus } from "@/cf-worker/chat-agent/usage";

export const ChatSessionsResponse = Schema.Struct({
  sessions: ChatSessionRegistry,
  assistantCredits: Schema.optionalKey(AssistantCreditStatus),
});
export type ChatSessionsResponse = Schema.Schema.Type<
  typeof ChatSessionsResponse
>;

const ChatSessionErrorResponse = Schema.Struct({
  error: Schema.String.check(Schema.isMinLength(1)),
});

const decodeSessionError = Schema.decodeUnknownOption(ChatSessionErrorResponse);

export const chatSessionFailure = async (
  response: Response,
  fallback: string
): Promise<Error> => {
  const body: unknown = await response.json().catch(() => null);
  return Option.match(decodeSessionError(body), {
    onNone: () => new Error(`${fallback}: ${response.status}`),
    onSome: ({ error }) => new Error(error),
  });
};

export const chatSessionsEndpoint = (workspaceId: string) =>
  `/api/chat/sessions?workspaceId=${encodeURIComponent(workspaceId)}`;

export const chatSessionEndpoint = (workspaceId: string, agentName: string) =>
  `/api/chat/sessions/${encodeURIComponent(agentName)}?workspaceId=${encodeURIComponent(workspaceId)}`;

export async function fetchChatSessions(
  url: string
): Promise<ChatSessionsResponse> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`Chat sessions failed: ${response.status}`);
  return Schema.decodeUnknownPromise(ChatSessionsResponse)(
    await response.json()
  );
}

export const decodeChatSessionsResponse =
  Schema.decodeUnknownPromise(ChatSessionsResponse);
