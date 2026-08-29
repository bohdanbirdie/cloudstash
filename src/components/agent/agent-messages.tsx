import type { UIMessage } from "ai";
import { isToolUIPart } from "ai";
import { Match } from "effect";

import { AssistantActivity } from "@/components/chat/chat-content/assistant-activity";
import { ChatMessage } from "@/components/chat/chat-content/chat-message";
import { EmptyState } from "@/components/chat/chat-content/empty-state";
import { ErrorMessage } from "@/components/chat/chat-content/error-message";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/chat/conversation";
import { getToolActivityLabel, isActiveToolPart } from "@/components/ui/tool";

import { useAgentChat } from "./agent-chat-provider";

export function AgentMessages() {
  const { messages, status, isBusy, error } = useAgentChat();

  return (
    <AgentMessagesView
      messages={messages}
      status={status}
      isBusy={isBusy}
      error={error}
    />
  );
}

export function AgentMessagesView({
  messages,
  status,
  isBusy,
  error,
}: {
  messages: UIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  isBusy: boolean;
  error?: Error;
}) {
  const hasError = status === "error";
  const activityLabel = getActivityLabel(messages, status);

  return (
    <Conversation>
      <ConversationContent>
        {messages.length === 0 && <EmptyState />}
        {messages.map((message, index) => (
          <ChatMessage
            key={message.id}
            message={message}
            showToolSummary={!isBusy || index < messages.length - 1}
          />
        ))}
        <AssistantActivity
          active={isBusy}
          label={activityLabel}
          className="-mt-2"
        />
        {hasError && <ErrorMessage error={error} />}
      </ConversationContent>
      <ConversationScrollButton className="bottom-2" />
    </Conversation>
  );
}

function getActivityLabel(
  messages: UIMessage[],
  status: "submitted" | "streaming" | "ready" | "error"
): string {
  const toolParts = messages.flatMap((message) =>
    message.parts.filter(isToolUIPart)
  );

  return Match.value(toolParts.findLast(isActiveToolPart)).pipe(
    Match.when(Match.undefined, () =>
      Match.value(status).pipe(
        Match.when("streaming", () => "Writing an answer"),
        Match.orElse(() => "Thinking")
      )
    ),
    Match.orElse(getToolActivityLabel)
  );
}
