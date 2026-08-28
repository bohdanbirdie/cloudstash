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

import { useAgentChat } from "./agent-chat-provider";

export function AgentMessages() {
  const { messages, status, isBusy, error, addToolApprovalResponse } =
    useAgentChat();

  const hasError = status === "error";

  const handleApprove = useCallback(
    (approvalId: string) => {
      addToolApprovalResponse({ id: approvalId, approved: true });
    },
    [addToolApprovalResponse]
  );

  const handleReject = useCallback(
    (approvalId: string) => {
      addToolApprovalResponse({ id: approvalId, approved: false });
    },
    [addToolApprovalResponse]
  );

  return (
    <Conversation>
      <ConversationContent className="px-3 pb-2">
        {messages.length === 0 && <EmptyState />}
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        ))}
        <Thinking isLoading={isBusy} />
        {hasError && <ErrorMessage error={error} />}
      </ConversationContent>
      <ConversationScrollButton className="bottom-2" />
    </Conversation>
  );
}
