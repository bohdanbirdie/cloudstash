import { useCallback } from "react";

import { ChatMessage } from "@/components/chat/chat-content/chat-message";
import { EmptyState } from "@/components/chat/chat-content/empty-state";
import { ErrorMessage } from "@/components/chat/chat-content/error-message";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/chat/conversation";
import { Thinking } from "@/components/ui/thinking";
import { APPROVAL } from "@/components/ui/tool";

import { useAgentChat } from "./agent-chat-provider";

export function AgentMessages() {
  const { messages, status, error, addToolOutput } = useAgentChat();

  const isStreaming = status === "streaming";
  const hasError = status === "error";

  const handleApprove = useCallback(
    (toolCallId: string, toolName: string) => {
      addToolOutput({ toolCallId, toolName, output: APPROVAL.YES });
    },
    [addToolOutput]
  );

  const handleReject = useCallback(
    (toolCallId: string, toolName: string) => {
      addToolOutput({ toolCallId, toolName, output: APPROVAL.NO });
    },
    [addToolOutput]
  );

  return (
    <Conversation>
      <ConversationContent className="px-2 pb-2">
        {messages.length === 0 && <EmptyState />}
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        ))}
        <Thinking isLoading={isStreaming} />
        {hasError && <ErrorMessage error={error} />}
      </ConversationContent>
      <ConversationScrollButton className="bottom-2" />
    </Conversation>
  );
}
