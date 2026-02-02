import { createGroq } from "@ai-sdk/groq";
import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  createStoreDoPromise,
  type ClientDoWithRpcCallback,
} from "@livestore/adapter-cloudflare";
import { nanoid, type Store } from "@livestore/livestore";
import { handleSyncUpdateRpc } from "@livestore/sync-cf/client";
import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
} from "ai";
import { schema } from "../../livestore/schema";
import { type Env } from "../shared";
import { CONTEXT_WINDOW_SIZE, SYSTEM_PROMPT } from "./config";
import { extractRetryTime, isRateLimitError } from "./errors";
import { getLastUserMessageText, validateInput } from "./input-validator";
import { writeTextMessage } from "./stream-helpers";
import { createTools, createToolExecutors } from "./tools";
import { hasToolConfirmation, processToolCalls } from "./utils";

function formatError(error: unknown): string {
  if (isRateLimitError(error)) {
    return `I've hit my rate limit. Please try again in ${extractRetryTime(error)}.`;
  }
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("tool_use_failed") || msg.includes("tool_calls")) {
    return "I had trouble processing that request. Could you try rephrasing?";
  }
  return "Something went wrong. Please try again.";
}

export class ChatAgentDO
  extends AIChatAgent<Env>
  implements ClientDoWithRpcCallback
{
  __DURABLE_OBJECT_BRAND = "chat-agent-do" as never;
  private cachedStore: Store<typeof schema> | undefined;

  private async getSessionId(): Promise<string> {
    const key = "chat-session-id";
    const stored = await this.ctx.storage.get<string>(key);
    if (stored) return stored;

    const newSessionId = `chat-${this.name}-${nanoid()}`;
    await this.ctx.storage.put(key, newSessionId);
    return newSessionId;
  }

  private async getStore(): Promise<Store<typeof schema>> {
    if (this.cachedStore) return this.cachedStore;

    const sessionId = await this.getSessionId();
    this.cachedStore = await createStoreDoPromise({
      clientId: "chat-agent-do",
      durableObject: {
        bindingName: "Chat",
        ctx: this.ctx,
        env: this.env,
      } as never,
      livePull: true,
      schema,
      sessionId,
      storeId: this.name,
      syncBackendStub: this.env.SYNC_BACKEND_DO.get(
        this.env.SYNC_BACKEND_DO.idFromName(this.name)
      ) as never,
    });

    return this.cachedStore;
  }

  async syncUpdateRpc(payload: unknown): Promise<void> {
    if (!this.cachedStore) await this.getStore();
    await handleSyncUpdateRpc(payload);
  }

  async onChatMessage() {
    const groq = createGroq({ apiKey: this.env.GROQ_API_KEY });
    const model = groq("llama-3.3-70b-versatile");

    const store = await this.getStore();
    const tools = createTools(store);
    const toolExecutors = createToolExecutors(store);

    const lastMessage = this.messages[this.messages.length - 1];
    if (hasToolConfirmation(lastMessage)) {
      return this.handleToolConfirmation(model, tools, toolExecutors);
    }

    const userText = getLastUserMessageText(this.messages);
    if (userText) {
      const validation = validateInput(userText);
      if (!validation.allowed) {
        const blockedStream = createUIMessageStream({
          execute: ({ writer }) => {
            writeTextMessage(
              writer,
              validation.reason ?? "I can only help with link management.",
              "blocked"
            );
          },
        });
        return createUIMessageStreamResponse({ stream: blockedStream });
      }
    }

    return this.handleNormalChat(model, tools);
  }

  private handleToolConfirmation(
    model: ReturnType<ReturnType<typeof createGroq>>,
    tools: ReturnType<typeof createTools>,
    toolExecutors: ReturnType<typeof createToolExecutors>
  ) {
    const stream = createUIMessageStream({
      onError: formatError,
      execute: async ({ writer }) => {
        const updatedMessages = await processToolCalls(
          { messages: this.messages, tools },
          toolExecutors
        );

        this.messages = updatedMessages;
        await this.persistMessages(this.messages);

        const recentMessages = this.messages.slice(-CONTEXT_WINDOW_SIZE);
        const messages = await convertToModelMessages(recentMessages);

        const result = streamText({
          model,
          system: `${SYSTEM_PROMPT}\n\nCurrent workspace: ${this.name}`,
          messages,
          tools,
          stopWhen: stepCountIs(5),
        });

        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  }

  private handleNormalChat(
    model: ReturnType<ReturnType<typeof createGroq>>,
    tools: ReturnType<typeof createTools>
  ) {
    const stream = createUIMessageStream({
      onError: formatError,
      execute: async ({ writer }) => {
        const recentMessages = this.messages.slice(-CONTEXT_WINDOW_SIZE);
        const messages = await convertToModelMessages(recentMessages);

        const result = streamText({
          model,
          system: `${SYSTEM_PROMPT}\n\nCurrent workspace: ${this.name}`,
          messages,
          tools,
          stopWhen: stepCountIs(5),
        });

        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  }
}
