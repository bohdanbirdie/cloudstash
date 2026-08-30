import type { Meta, StoryObj } from "@storybook/react-vite";
import type { DynamicToolUIPart, UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
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
import { AssistantActivity } from "@/components/chat/chat-content/assistant-activity";
import { ChatMessage } from "@/components/chat/chat-content/chat-message";
import {
  Conversation,
  ConversationContent,
} from "@/components/chat/conversation";
import type { ArchiveLinkPreview } from "@/components/chat/link-delete-confirmation";
import { LinkDeleteConfirmationView } from "@/components/chat/link-delete-confirmation";
import { Tool, ToolApproval } from "@/components/ui/tool";

type Scenario =
  | "empty"
  | "conversation"
  | "long-conversation"
  | "multiline-composer"
  | "working"
  | "approval-continuation"
  | "archive-complete"
  | "tool-error"
  | "tool-denied"
  | "chat-error"
  | "disconnected";

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

const MANY_STORY_SESSIONS: readonly ChatSession[] = Array.from(
  { length: 40 },
  (_, index) => {
    const day = String(29 - (index % 28)).padStart(2, "0");
    return {
      id: `session-${index + 1}`,
      agentName: `session-${index + 1}`,
      title:
        index % 7 === 0
          ? `A deliberately long chat title for saved-link research ${index + 1}`
          : `Saved-link conversation ${index + 1}`,
      createdAt: `2026-08-${day}T08:00:00.000Z`,
      updatedAt: `2026-08-${day}T09:30:00.000Z`,
    };
  }
);

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
        output: {
          total: 1,
          results: [
            {
              title: "A practical guide to better sleep",
              url: "https://www.sleepfoundation.org/sleep-hygiene",
            },
          ],
        },
      },
      {
        type: "dynamic-tool",
        toolName: "getLink",
        toolCallId: "open-sleep-link",
        state: "output-available",
        input: { id: "sleep-guide" },
        output: {
          title: "A practical guide to better sleep",
          url: "https://www.sleepfoundation.org/sleep-hygiene",
        },
      },
    ],
    "I found one strong match: **A practical guide to better sleep**."
  ),
];

const LONG_CONVERSATION: UIMessage[] = [
  assistantMessage(
    "long-welcome",
    "Hello! I can help you find, save, and organize your links."
  ),
  userMessage("long-question-1", "What did I save about visiting Lisbon?"),
  assistantMessage(
    "long-answer-1",
    "You saved three useful guides. **A weekend walking through Lisbon** is the best overview, while **Quiet neighborhoods to stay in** is more practical for choosing a base."
  ),
  userMessage("long-question-2", "Which one covers places away from crowds?"),
  assistantMessage(
    "long-answer-2",
    "**Quiet neighborhoods to stay in** focuses on Estrela and Campo de Ourique, with calmer streets and easy tram connections."
  ),
  userMessage("long-question-3", "Did I save anything about day trips?"),
  assistantMessage(
    "long-answer-3",
    "Yes. You saved **Sintra without rushing**, a one-day route that starts early and avoids fitting every palace into one visit."
  ),
  userMessage("long-question-4", "What should I read first?"),
  assistantMessage(
    "long-answer-4",
    "Start with the weekend overview. Then open the neighborhood guide once you know which parts of the city you want to spend more time in."
  ),
  userMessage("long-question-5", "Give me the short version."),
  assistantMessage(
    "long-answer-5",
    "Stay near Estrela, explore one area at a time, and keep a separate day for Sintra."
  ),
];

const SCENARIOS: Record<
  Scenario,
  {
    messages: UIMessage[];
    status: "submitted" | "streaming" | "ready" | "error";
    isBusy: boolean;
    isConnected: boolean;
    error?: Error;
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
  "long-conversation": {
    messages: LONG_CONVERSATION,
    status: "ready",
    isBusy: false,
    isConnected: true,
  },
  "multiline-composer": {
    messages: CONVERSATION.slice(0, 3),
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
  "approval-continuation": {
    messages: [
      userMessage("archive-question", "Archive that Lisbon link"),
      toolMessage("archive-approved", {
        type: "dynamic-tool",
        toolName: "deleteLink",
        toolCallId: "archive-link",
        state: "approval-responded",
        input: { id: "lisbon-weekend" },
        approval: { id: "archive-approval", approved: true },
      }),
    ],
    status: "submitted",
    isBusy: true,
    isConnected: true,
  },
  "archive-complete": {
    messages: [
      userMessage("archive-complete-question", "Archive those travel links"),
      toolMessage("archive-complete-tool", {
        type: "dynamic-tool",
        toolName: "deleteLinks",
        toolCallId: "archive-complete",
        state: "output-available",
        input: {
          ids: ["night-train", "lisbon-weekend", "quiet-neighborhoods"],
        },
        output: { updated: 3 },
      }),
    ],
    status: "ready",
    isBusy: false,
    isConnected: true,
  },
  "tool-error": {
    messages: [
      userMessage("error-question", "Open the link I mentioned"),
      toolMessage("error-tool", {
        type: "dynamic-tool",
        toolName: "getLink",
        toolCallId: "get-missing-link",
        state: "output-error",
        input: { id: "missing-link" },
        errorText: "That link is no longer available.",
      }),
    ],
    status: "ready",
    isBusy: false,
    isConnected: true,
  },
  "tool-denied": {
    messages: [
      userMessage("denied-question", "Archive those links"),
      toolMessage("denied-tool", {
        type: "dynamic-tool",
        toolName: "deleteLinks",
        toolCallId: "denied-archive",
        state: "output-denied",
        input: { ids: ["night-train", "lisbon-weekend"] },
        approval: { id: "denied-approval", approved: false },
      }),
      assistantMessage("denied-answer", "No changes made."),
    ],
    status: "ready",
    isBusy: false,
    isConnected: true,
  },
  "chat-error": {
    messages: [userMessage("chat-error-question", "Summarize my latest saves")],
    status: "error",
    isBusy: false,
    isConnected: true,
    error: new Error("provider unavailable"),
  },
  disconnected: {
    messages: CONVERSATION.slice(0, 1),
    status: "ready",
    isBusy: false,
    isConnected: false,
  },
};

function AgentPanelPreview({ scenario }: { scenario: Scenario }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const config = SCENARIOS[scenario];
  const [messages, setMessages] = useState(config.messages);
  const canSend = config.isConnected && !config.isBusy;
  const initialDraft =
    scenario === "multiline-composer"
      ? "Find my saved guides to Lisbon\nand compare their recommendations"
      : undefined;

  return (
    <div className="h-[480px] w-[min(480px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground">
      <AgentInputProvider textareaRef={textareaRef} initialDraft={initialDraft}>
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
              error={config.error}
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
    </div>
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
    "city-guides-and-weekend-itineraries.nationalgeographic.com",
    "www.nationalgeographic.com",
  ],
  ["Quiet mornings", "www.nationalgeographic.com"],
  [
    "The quiet return of overnight trains across Europe and the routes worth taking next",
    "afar.com",
  ],
  ["A weekend walking through Lisbon", "lonelyplanet.com"],
  ["Quiet neighborhoods to stay in", "cntraveler.com"],
  ["Sintra without rushing", "afar.com"],
  ["A guide to Lisbon’s old bookshops", "lithub.com"],
  ["The city’s best small museums", "timeout.com"],
  ["Walking the coast near Cascais", "alltrails.com"],
  ["Where to hear live fado", "atlasobscura.com"],
  ["A local guide to Portuguese pastries", "seriouseats.com"],
  ["Lisbon by tram and on foot", "nationalgeographic.com"],
  ["The tiled facades of Alfama", "architecturaldigest.com"],
  ["Independent shops worth visiting", "monocle.com"],
  ["A slow afternoon in Belém", "culturetrip.com"],
  ["How to use Lisbon’s transit card", "visitlisboa.com"],
  ["The best viewpoints at sunset", "earthtrekkers.com"],
  ["Day trips south of the river", "roadtrippers.com"],
  ["A short history of azulejos", "vam.ac.uk"],
  ["Coffee shops for a quiet morning", "eater.com"],
  ["Packing lightly for a city break", "cntraveler.com"],
  ["A photographer’s walk through Lisbon", "magnumphotos.com"],
].map(([title, domain, faviconDomain], index) => ({
  id: `archive-link-${index + 1}`,
  title: title ?? "Saved link",
  domain: domain ?? "example.com",
  favicon: `https://${faviconDomain ?? domain ?? "example.com"}/favicon.ico`,
}));

function ArchiveConfirmationPreview({
  links = ARCHIVE_LINKS.slice(0, 1),
  defaultExpanded = false,
  visible = true,
}: {
  links?: ArchiveLinkPreview[];
  defaultExpanded?: boolean;
  visible?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="h-[480px] w-[min(480px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground">
      <AgentInputProvider textareaRef={textareaRef}>
        <AgentPanelSurface
          header={<AgentHeaderView isConnected />}
          messages={
            <Conversation>
              <ConversationContent>
                <ChatMessage
                  message={userMessage(
                    "archive-request",
                    links.length > 2
                      ? "Archive these travel links"
                      : "Archive those two travel links"
                  )}
                />
              </ConversationContent>
            </Conversation>
          }
          input={
            <InputForm
              canSend={!visible}
              muted={visible}
              placeholder={
                visible ? "Confirmation required" : "Ask about your links…"
              }
              approval={
                visible ? (
                  <LinkDeleteConfirmationView
                    links={links}
                    onApprove={onApprove}
                    onReject={onReject}
                    surface="composer"
                    defaultExpanded={defaultExpanded}
                  />
                ) : undefined
              }
              onSubmit={() => {}}
            />
          }
        />
      </AgentInputProvider>
    </div>
  );
}

function AnimatedArchiveConfirmationPreview() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setVisible((current) => !current);
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [visible]);

  return (
    <ArchiveConfirmationPreview
      links={ARCHIVE_LINKS.slice(0, 3)}
      visible={visible}
    />
  );
}

function GenericConfirmationPreview() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="h-[480px] w-[min(480px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground">
      <AgentInputProvider textareaRef={textareaRef}>
        <AgentPanelSurface
          header={<AgentHeaderView isConnected />}
          messages={
            <Conversation>
              <ConversationContent>
                <ChatMessage
                  message={userMessage(
                    "generic-approval-request",
                    "Use the suggested action"
                  )}
                />
              </ConversationContent>
            </Conversation>
          }
          input={
            <InputForm
              canSend={false}
              muted
              placeholder="Confirmation required"
              approval={
                <ToolApproval
                  toolPart={GENERIC_APPROVAL}
                  surface="composer"
                  onApprove={onApprove}
                  onReject={onReject}
                />
              }
              onSubmit={() => {}}
            />
          }
        />
      </AgentInputProvider>
    </div>
  );
}

const GENERIC_APPROVAL = {
  type: "dynamic-tool",
  toolName: "futureAction",
  toolCallId: "approval",
  state: "approval-requested",
  input: {},
  approval: { id: "approval" },
} satisfies DynamicToolUIPart;

const TOOL_ERROR: DynamicToolUIPart = {
  type: "dynamic-tool",
  toolName: "getLink",
  toolCallId: "failed",
  state: "output-error",
  input: { id: "missing" },
  errorText: "Internal implementation detail that must stay hidden.",
};

const completedTool = (
  toolName: string,
  toolCallId: string
): DynamicToolUIPart => ({
  type: "dynamic-tool",
  toolName,
  toolCallId,
  state: "output-available",
  input: {},
  output: {},
});

const TOOL_RUN_EXAMPLES: ReadonlyArray<{
  title: string;
  parts: DynamicToolUIPart[];
}> = [
  {
    title: "Single tool",
    parts: [completedTool("searchLinks", "single-search")],
  },
  {
    title: "Mixed tools",
    parts: [
      completedTool("searchLinks", "mixed-search"),
      completedTool("getLink", "mixed-open"),
    ],
  },
  {
    title: "Consecutive repeats",
    parts: [
      completedTool("listRecentLinks", "recent-list"),
      ...Array.from({ length: 5 }, (_, index) =>
        completedTool("getLink", `recent-open-${index}`)
      ),
    ],
  },
  {
    title: "Interrupted repeats",
    parts: [
      completedTool("getLink", "first-open-1"),
      completedTool("getLink", "first-open-2"),
      completedTool("searchLinks", "interrupted-search"),
      completedTool("getLink", "second-open-1"),
      completedTool("getLink", "second-open-2"),
    ],
  },
];

function ToolRunGallery() {
  return (
    <div className="grid w-[min(960px,calc(100vw-2rem))] gap-4 md:grid-cols-2">
      {TOOL_RUN_EXAMPLES.map((example) => (
        <section
          key={example.title}
          className="space-y-3 rounded-lg border p-4"
        >
          <h2 className="text-xs font-medium text-muted-foreground">
            {example.title}
          </h2>
          <ChatMessage
            message={toolSequenceMessage(
              `tool-run-${example.title}`,
              example.parts,
              "Assistant text shares this leading edge."
            )}
          />
        </section>
      ))}
    </div>
  );
}

function ActivityAndErrorsGallery() {
  return (
    <div className="grid w-[min(960px,calc(100vw-2rem))] gap-4 md:grid-cols-2">
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-xs font-medium text-muted-foreground">Activity</h2>
        <AssistantActivity
          active
          debounceMs={0}
          label="Searching your library"
        />
      </section>
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-xs font-medium text-muted-foreground">
          Recoverable error
        </h2>
        <Tool toolPart={TOOL_ERROR} />
      </section>
    </div>
  );
}

function SessionListPreview({
  sessions = STORY_SESSIONS,
  error,
  assistantCredits = {
    limit: 1_000,
    remaining: 842,
    resetsAt: "2026-09-01T00:00:00.000Z",
  },
}: {
  sessions?: readonly ChatSession[];
  error?: Error;
  assistantCredits?: {
    limit: number;
    remaining: number;
    resetsAt: string;
  };
}) {
  return (
    <div className="h-[480px] w-[min(480px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground">
      <AgentSessionListView
        sessions={sessions}
        assistantCredits={assistantCredits}
        error={error}
        onSelect={onSelectSession}
        onCreate={noopSessionAction}
        onDelete={noopDeleteSession}
        onOpenUsage={() => undefined}
        onRetry={noopSessionAction}
      />
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
export const SessionList: Story = {
  render: () => <SessionListPreview />,
};
export const ScrollableSessionList: Story = {
  render: () => <SessionListPreview sessions={MANY_STORY_SESSIONS} />,
};
export const EmptySessionList: Story = {
  render: () => <SessionListPreview sessions={[]} />,
};
export const SessionListError: Story = {
  render: () => (
    <SessionListPreview
      sessions={[]}
      error={new Error("Session registry unavailable")}
    />
  ),
};
export const LongConversation: Story = {
  args: { scenario: "long-conversation" },
};
export const MultilineComposer: Story = {
  args: { scenario: "multiline-composer" },
};
export const Empty: Story = { args: { scenario: "empty" } };
export const Working: Story = { args: { scenario: "working" } };
export const ApprovalContinuation: Story = {
  args: { scenario: "approval-continuation" },
};
export const ArchiveComplete: Story = {
  args: { scenario: "archive-complete" },
};
export const SingleArchiveConfirmation: Story = {
  render: () => (
    <ArchiveConfirmationPreview links={ARCHIVE_LINKS.slice(0, 1)} />
  ),
};
export const BulkArchiveConfirmation: Story = {
  render: () => <ArchiveConfirmationPreview links={ARCHIVE_LINKS} />,
};
export const ExpandedBulkArchiveConfirmation: Story = {
  render: () => (
    <ArchiveConfirmationPreview links={ARCHIVE_LINKS} defaultExpanded />
  ),
};
export const AnimatedArchiveConfirmation: Story = {
  render: () => <AnimatedArchiveConfirmationPreview />,
};
export const GenericConfirmation: Story = {
  render: () => <GenericConfirmationPreview />,
};
export const ToolError: Story = { args: { scenario: "tool-error" } };
export const ToolDenied: Story = { args: { scenario: "tool-denied" } };
export const ChatError: Story = { args: { scenario: "chat-error" } };
export const Disconnected: Story = { args: { scenario: "disconnected" } };
export const ActivityAndErrors: Story = {
  render: () => <ActivityAndErrorsGallery />,
};
export const ToolRunSummaries: Story = {
  render: () => <ToolRunGallery />,
};
