import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  createStoreDoPromise,
  type ClientDoWithRpcCallback,
} from "@livestore/adapter-cloudflare";
import { nanoid, type Store } from "@livestore/livestore";
import { handleSyncUpdateRpc } from "@livestore/sync-cf/client";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type Connection, type ConnectionContext } from "agents";
import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  type LanguageModel,
} from "ai";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { schema } from "../../livestore/schema";
import { createDb } from "../db";
import * as dbSchema from "../db/schema";
import { type OrgFeatures } from "../db/schema";
import { type Env } from "../shared";
import { CONTEXT_WINDOW_SIZE, SYSTEM_PROMPT } from "./config";
import {
  extractRetryTime,
  isCreditLimitError,
  isRateLimitError,
} from "./errors";
import { getLastUserMessageText, validateInput } from "./input-validator";
import { writeTextMessage } from "./stream-helpers";
import { createTools, createToolExecutors } from "./tools";
import {
  DEFAULT_MONTHLY_BUDGET,
  LIMIT_REACHED_MESSAGE,
  budgetToTokenLimit,
  getCurrentPeriod,
  getUsageKey,
  type ChatAgentState,
  type UsageData,
} from "./usage";
import { hasToolConfirmation, processToolCalls } from "./utils";

function formatError(error: unknown): string {
  if (isRateLimitError(error)) {
    return `I've hit my rate limit. Please try again in ${extractRetryTime(error)}.`;
  }
  if (isCreditLimitError(error)) {
    return "I've reached my spending limit. Please try again later.";
  }
  const msg = error instanceof Error ? error.message : String(error);
  if (
    msg.includes("tool_use_failed") ||
    msg.includes("tool_calls") ||
    msg.includes("Failed to call a function") ||
    msg.includes("tool call validation failed")
  ) {
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

  async onConnect(connection: Connection, ctx: ConnectionContext) {
    await super.onConnect(connection, ctx);
    void this.broadcastUsage();
  }

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

  private recordTokenUsage(
    promptTokens: number,
    completionTokens: number
  ): Effect.Effect<void> {
    const key = getUsageKey(getCurrentPeriod());
    return Effect.gen(this, function* () {
      const current = yield* Effect.promise(() =>
        this.ctx.storage.get<UsageData>(key)
      );
      yield* Effect.promise(() =>
        this.ctx.storage.put(key, {
          promptTokens: (current?.promptTokens ?? 0) + promptTokens,
          completionTokens: (current?.completionTokens ?? 0) + completionTokens,
        })
      );
    });
  }

  private getUsage(): Effect.Effect<NonNullable<ChatAgentState["usage"]>> {
    return Effect.gen(this, function* () {
      const period = getCurrentPeriod();
      const usage = yield* Effect.promise(() =>
        this.ctx.storage.get<UsageData>(getUsageKey(period))
      );
      const used = (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0);

      const db = createDb(this.env.DB);
      const org = yield* Effect.promise(() =>
        db.query.organization.findFirst({
          where: eq(dbSchema.organization.id, this.name),
          columns: { features: true },
        })
      );

      const features = (org?.features as OrgFeatures) ?? {};
      const budget = features.monthlyTokenBudget ?? DEFAULT_MONTHLY_BUDGET;
      const limit = budgetToTokenLimit(budget);

      return { used, limit, budget, period };
    });
  }

  private broadcastUsage(): Promise<void> {
    return this.getUsage().pipe(
      Effect.tap((usage) => Effect.sync(() => this.setState({ usage }))),
      Effect.asVoid,
      Effect.catchAll(() => Effect.void),
      Effect.runPromise
    );
  }

  private isWithinTokenLimit(): Promise<boolean> {
    return this.getUsage().pipe(
      Effect.map(({ used, limit }) => used < limit),
      Effect.runPromise
    );
  }

  async onChatMessage() {
    await this.broadcastUsage();

    const withinLimit = await this.isWithinTokenLimit();
    if (!withinLimit) {
      const limitStream = createUIMessageStream({
        execute: ({ writer }) => {
          writeTextMessage(writer, LIMIT_REACHED_MESSAGE, "limit");
        },
      });
      return createUIMessageStreamResponse({ stream: limitStream });
    }

    const openrouter = createOpenRouter({
      apiKey: this.env.OPENROUTER_API_KEY,
    });
    const model = openrouter("google/gemini-2.5-flash");

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
    model: LanguageModel,
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
          system: SYSTEM_PROMPT,
          messages,
          tools,
          stopWhen: stepCountIs(5),
          onFinish: ({ usage }) => {
            void this.recordTokenUsage(
              usage.inputTokens ?? 0,
              usage.outputTokens ?? 0
            ).pipe(
              Effect.tap(() => Effect.promise(() => this.broadcastUsage())),
              Effect.runPromise
            );
          },
        });

        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  }

  private handleNormalChat(
    model: LanguageModel,
    tools: ReturnType<typeof createTools>
  ) {
    const stream = createUIMessageStream({
      onError: formatError,
      execute: async ({ writer }) => {
        const recentMessages = this.messages.slice(-CONTEXT_WINDOW_SIZE);
        const messages = await convertToModelMessages(recentMessages);

        const result = streamText({
          model,
          system: SYSTEM_PROMPT,
          messages,
          tools,
          stopWhen: stepCountIs(5),
          onFinish: ({ usage }) => {
            void this.recordTokenUsage(
              usage.inputTokens ?? 0,
              usage.outputTokens ?? 0
            ).pipe(
              Effect.tap(() => Effect.promise(() => this.broadcastUsage())),
              Effect.runPromise
            );
          },
        });

        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  }
}
