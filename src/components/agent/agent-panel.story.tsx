import type { Meta, StoryObj } from "@storybook/react-vite";
import type { DynamicToolUIPart, UIMessage } from "ai";
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { fn } from "storybook/test";

import type { ChatSession } from "@/cf-worker/chat-agent/sessions";
import {
  AgentInputProvider,
  useAgentInput,
} from "@/components/agent/agent-chat-provider";
import { AgentHeaderView } from "@/components/agent/agent-header";
import { InputForm } from "@/components/agent/agent-input";
import { AgentMessagesView } from "@/components/agent/agent-messages";
import { AgentPanelSurface } from "@/components/agent/agent-panel";
import { AgentSessionListView } from "@/components/agent/agent-session-list";
import type { ArchiveLinkPreview } from "@/components/chat/link-delete-confirmation";
import { LinkDeleteConfirmationView } from "@/components/chat/link-delete-confirmation";

type Scenario = "empty" | "conversation" | "working";

const onApprove = fn();
const onReject = fn();
const onSelectSession = fn();
const noopSessionAction = async () => {};
const noopDeleteSession = async (_agentName: string) => {};

const STORY_SESSIONS: readonly ChatSession[] = [
  {
    id: "lisbon",
    agentName: "lisbon",
    title: "Weekend in Lisbon",
    createdAt: "2026-08-29T08:00:00.000Z",
    updatedAt: "2026-08-29T09:30:00.000Z",
  },
  {
    id: "reading",
    agentName: "reading",
    title: "Reading queue",
    createdAt: "2026-08-25T08:00:00.000Z",
    updatedAt: "2026-08-28T15:20:00.000Z",
  },
  {
    id: "legacy",
    agentName: "legacy",
    title: "A deliberately long chat title that should truncate cleanly",
    createdAt: "2026-08-20T08:00:00.000Z",
    updatedAt: "2026-08-27T12:00:00.000Z",
  },
];

const userMessage = (id: string, text: string): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

const assistantMessage = (id: string, text: string): UIMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "text", text }],
});

const toolMessage = (
  id: string,
  part: DynamicToolUIPart,
  text?: string
): UIMessage => ({
  id,
  role: "assistant",
  parts: [...(text ? [{ type: "text" as const, text }] : []), part],
});

const toolSequenceMessage = (
  id: string,
  parts: DynamicToolUIPart[],
  text?: string
): UIMessage => ({
  id,
  role: "assistant",
  parts: [...parts, ...(text ? [{ type: "text" as const, text }] : [])],
});

const CONVERSATION: UIMessage[] = [
  assistantMessage(
    "welcome",
    "Hello! I can help you find, save, and organize your links."
  ),
  userMessage("recent-question", "What was the last link I saved?"),
  toolMessage(
    "recent-answer",
    {
      type: "dynamic-tool",
      toolName: "listRecentLinks",
      toolCallId: "recent-links",
      state: "output-available",
      input: { limit: 1 },
      output: {
        links: [
          {
            title: "A weekend walking through Lisbon",
            url: "https://www.lonelyplanet.com/lisbon/weekend",
          },
        ],
      },
    },
    "Your latest save is **A weekend walking through Lisbon**."
  ),
  userMessage("search-question", "Find my link about better sleep"),
  toolSequenceMessage(
    "search-answer",
    [
      {
        type: "dynamic-tool",
        toolName: "searchLinks",
        toolCallId: "search-links",
        state: "output-available",
        input: { query: "better sleep" },
        output: { total: 1 },
      },
      {
        type: "dynamic-tool",
        toolName: "getLink",
        toolCallId: "open-sleep-link",
        state: "output-available",
        input: { id: "sleep-guide" },
        output: { title: "A practical guide to better sleep" },
      },
    ],
    "I found one strong match: **A practical guide to better sleep**."
  ),
];

const SCENARIOS: Record<
  Scenario,
  {
    messages: UIMessage[];
    status: "submitted" | "streaming" | "ready" | "error";
    isBusy: boolean;
    isConnected: boolean;
  }
> = {
  empty: {
    messages: [],
    status: "ready",
    isBusy: false,
    isConnected: true,
  },
  conversation: {
    messages: CONVERSATION,
    status: "ready",
    isBusy: false,
    isConnected: true,
  },
  working: {
    messages: [
      ...CONVERSATION.slice(0, 1),
      userMessage("working-question", "Find everything I saved about Lisbon"),
      toolMessage("working-tool", {
        type: "dynamic-tool",
        toolName: "searchLinks",
        toolCallId: "working-search",
        state: "input-streaming",
        input: { query: "Lisbon" },
      }),
    ],
    status: "streaming",
    isBusy: true,
    isConnected: true,
  },
};

function AgentPanelPreview({ scenario }: { scenario: Scenario }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const config = SCENARIOS[scenario];
  const [messages, setMessages] = useState(config.messages);
  const canSend = config.isConnected && !config.isBusy;

  return (
    <PanelFrame>
      <AgentInputProvider textareaRef={textareaRef}>
        <AgentPanelSurface
          header={
            <AgentHeaderView
              isConnected={config.isConnected}
              title="Weekend in Lisbon"
              onBack={() => onSelectSession("list")}
            />
          }
          messages={
            <AgentMessagesView
              messages={messages}
              status={config.status}
              isBusy={config.isBusy}
            />
          }
          input={
            <StoryInput
              canSend={canSend}
              placeholder="Ask about your links…"
              onSend={(text) =>
                setMessages((current) => [
                  ...current,
                  userMessage(`preview-${current.length}`, text),
                ])
              }
            />
          }
        />
      </AgentInputProvider>
    </PanelFrame>
  );
}

function StoryInput({
  canSend,
  placeholder,
  muted = false,
  onSend,
}: {
  canSend: boolean;
  placeholder: string;
  muted?: boolean;
  onSend: (text: string) => void;
}) {
  const { draft, setDraft } = useAgentInput();

  return (
    <InputForm
      canSend={canSend}
      placeholder={placeholder}
      muted={muted}
      onSubmit={() => {
        const text = draft.trim();
        if (!canSend || text.length === 0) return;
        onSend(text);
        setDraft("");
      }}
    />
  );
}

const ARCHIVE_LINKS: ArchiveLinkPreview[] = [
  [
    "A complete guide to planning a slow weekend in Lisbon without missing the neighborhoods locals love",
    "nationalgeographic.com",
  ],
  ["Quiet mornings", "nationalgeographic.com"],
  ["The quiet return of overnight trains across Europe", "afar.com"],
  ["A weekend walking through Lisbon", "lonelyplanet.com"],
  ["Quiet neighborhoods to stay in", "cntraveler.com"],
].map(([title, domain], index) => ({
  id: `archive-link-${index + 1}`,
  title,
  domain,
  favicon: `https://${domain}/favicon.ico`,
}));

function ArchiveConfirmationPreview() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <PanelFrame>
      <AgentInputProvider textareaRef={textareaRef}>
        <AgentPanelSurface
          header={<AgentHeaderView isConnected />}
          messages={
            <AgentMessagesView
              messages={[
                userMessage("archive-request", "Archive these travel links"),
              ]}
              status="ready"
              isBusy={false}
            />
          }
          input={
            <InputForm
              canSend={false}
              muted
              placeholder="Confirmation required"
              approval={
                <LinkDeleteConfirmationView
                  links={ARCHIVE_LINKS}
                  onApprove={onApprove}
                  onReject={onReject}
                  surface="composer"
                />
              }
              onSubmit={() => {}}
            />
          }
        />
      </AgentInputProvider>
    </PanelFrame>
  );
}

function SessionListPreview() {
  return (
    <PanelFrame>
      <AgentSessionListView
        sessions={STORY_SESSIONS}
        assistantCredits={{
          limit: 1_000,
          remaining: 842,
          resetsAt: "2026-09-01T00:00:00.000Z",
        }}
        onSelect={onSelectSession}
        onCreate={noopSessionAction}
        onDelete={noopDeleteSession}
        onOpenUsage={() => undefined}
        onRetry={noopSessionAction}
      />
    </PanelFrame>
  );
}

function PanelFrame({ children }: { children: ReactNode }) {
  return (
    <div className="h-[480px] w-[min(480px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground">
      {children}
    </div>
  );
}

const meta = {
  title: "Surfaces/Assistant/Chat",
  component: AgentPanelPreview,
  render: (args) => <AgentPanelPreview key={args.scenario} {...args} />,
  parameters: { layout: "centered" },
  args: { scenario: "conversation" },
  argTypes: {
    scenario: {
      control: "select",
      options: Object.keys(SCENARIOS),
    },
  },
} satisfies Meta<typeof AgentPanelPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConversationReady: Story = {};
export const Empty: Story = { args: { scenario: "empty" } };
export const Working: Story = { args: { scenario: "working" } };
export const SessionList: Story = { render: () => <SessionListPreview /> };
export const BulkArchiveConfirmation: Story = {
  render: () => <ArchiveConfirmationPreview />,
};
