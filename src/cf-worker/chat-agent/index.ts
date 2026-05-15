import { AIChatAgent } from "@cloudflare/ai-chat";
import { createStoreDoPromise } from "@livestore/adapter-cloudflare";
import type { ClientDoWithRpcCallback } from "@livestore/adapter-cloudflare";
import { nanoid } from "@livestore/livestore";
import type { Store } from "@livestore/livestore";
import { handleSyncUpdateRpc } from "@livestore/sync-cf/client";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { Connection, ConnectionContext } from "agents";
import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
} from "ai";
import type { LanguageModel } from "ai";
import { Effect, Layer } from "effect";

import { schema } from "../../livestore/schema";
import { OrgId } from "../db/branded";
import { DbClientLive } from "../db/service";
import { maskId } from "../log-utils";
import { OrgFeatures, OrgFeaturesLive } from "../org/features-service";
import type { Env } from "../shared";
import { OtelTracingLive } from "../tracing";
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
  ESTIMATED_TOKENS_PER_CALL,
  LIMIT_REACHED_MESSAGE,
  budgetToTokenLimit,
  getCurrentPeriod,
  getUsageKey,
} from "./usage";
import type { ChatAgentState, UsageData } from "./usage";
import { reconcileTokenUsageIn, reserveTokensIn } from "./usage-core";
import type { UsageStorage } from "./usage-core";
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
  override __DURABLE_OBJECT_BRAND = "chat-agent-do" as never;
  private cachedStore: Store<typeof schema> | undefined;

  override async onConnect(connection: Connection, ctx: ConnectionContext) {
    await super.onConnect(connection, ctx);
    void this.broadcastUsage();
  }

  /**
   * Wipes all DO storage (chat session id, message history, token usage).
   * Called by AccountDeletionWorkflow during account deletion.
   */
  async purgeAll(): Promise<void> {
    await Effect.runPromise(
      Effect.gen(this, function* () {
        this.cachedStore = undefined;
        yield* Effect.promise(() => this.ctx.storage.deleteAll());
        yield* Effect.logInfo("purgeAll: storage wiped").pipe(
          Effect.annotateLogs({ doId: this.ctx.id.toString() })
        );
      }).pipe(
        Effect.withSpan("ChatAgentDO.purgeAll"),
        Effect.provide(OtelTracingLive)
      )
    );
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

  private usageStorage(): UsageStorage {
    const key = getUsageKey(getCurrentPeriod());
    return {
      get: () => this.ctx.storage.get<UsageData>(key),
      put: (data) => this.ctx.storage.put(key, data),
    };
  }

  private async reserveTokens(estimate: number): Promise<boolean> {
    return Effect.runPromise(
      Effect.gen(this, function* () {
        const { limit } = yield* this.resolveBudget();
        const storage = this.usageStorage();
        const reserved = yield* Effect.promise(() =>
          this.ctx.blockConcurrencyWhile(() =>
            reserveTokensIn(storage, estimate, limit)
          )
        );
        yield* Effect.annotateCurrentSpan({
          estimate,
          limit,
          reserved: reserved ? "yes" : "no",
        });
        return reserved;
      }).pipe(
        Effect.withSpan("ChatAgentDO.reserveTokens", {
          attributes: { orgId: maskId(this.name) },
        }),
        Effect.provide(this.orgFeaturesLayer())
      )
    );
  }

  private recordTokenUsage(
    promptTokens: number,
    completionTokens: number,
    releaseReservation: number
  ): Effect.Effect<void> {
    const storage = this.usageStorage();
    return Effect.promise(() =>
      this.ctx.blockConcurrencyWhile(() =>
        reconcileTokenUsageIn(
          storage,
          promptTokens,
          completionTokens,
          releaseReservation
        )
      )
    ).pipe(
      Effect.withSpan("ChatAgentDO.recordTokenUsage", {
        attributes: {
          completionTokens,
          orgId: maskId(this.name),
          promptTokens,
          releaseReservation,
        },
      })
    );
  }

  private resolveBudget(): Effect.Effect<
    { budget: number; limit: number },
    never,
    OrgFeatures
  > {
    return Effect.gen(this, function* () {
      const orgFeatures = yield* OrgFeatures;
      const features = yield* orgFeatures.get(OrgId.make(this.name)).pipe(
        Effect.catchTag("DbError", (cause) =>
          Effect.logWarning("Falling back to default budget").pipe(
            Effect.annotateLogs({
              cause: String(cause),
              orgId: maskId(this.name),
            }),
            Effect.as({})
          )
        )
      );
      const budget =
        ("monthlyTokenBudget" in features
          ? features.monthlyTokenBudget
          : undefined) ?? DEFAULT_MONTHLY_BUDGET;
      return { budget, limit: budgetToTokenLimit(budget) };
    }).pipe(
      Effect.withSpan("ChatAgentDO.resolveBudget", {
        attributes: { orgId: maskId(this.name) },
      })
    );
  }

  private getUsage(): Effect.Effect<
    NonNullable<ChatAgentState["usage"]>,
    never,
    OrgFeatures
  > {
    return Effect.gen(this, function* () {
      const period = getCurrentPeriod();
      const usage = yield* Effect.promise(() =>
        this.ctx.storage.get<UsageData>(getUsageKey(period))
      );
      const used =
        (usage?.promptTokens ?? 0) +
        (usage?.completionTokens ?? 0) +
        (usage?.reservedTokens ?? 0);

      const { budget, limit } = yield* this.resolveBudget();
      return { used, limit, budget, period };
    });
  }

  private orgFeaturesLayer() {
    return OrgFeaturesLive.pipe(
      Layer.provide(DbClientLive(this.env.DB)),
      Layer.provideMerge(OtelTracingLive)
    );
  }

  private broadcastUsage(): Promise<void> {
    return this.getUsage().pipe(
      Effect.provide(this.orgFeaturesLayer()),
      Effect.tap((usage) => Effect.sync(() => this.setState({ usage }))),
      Effect.asVoid,
      Effect.runPromise
    );
  }

  override async onChatMessage() {
    await this.broadcastUsage();

    const reserved = await this.reserveTokens(ESTIMATED_TOKENS_PER_CALL);
    if (!reserved) {
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
          experimental_telemetry: { isEnabled: true },
          onFinish: ({ usage }) => {
            // ctx.waitUntil so DO eviction can't drop the usage write.
            this.ctx.waitUntil(
              this.recordTokenUsage(
                usage.inputTokens ?? 0,
                usage.outputTokens ?? 0,
                ESTIMATED_TOKENS_PER_CALL
              ).pipe(
                Effect.tap(() => Effect.promise(() => this.broadcastUsage())),
                Effect.provide(OtelTracingLive),
                Effect.runPromise
              )
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
          experimental_telemetry: { isEnabled: true },
          onFinish: ({ usage }) => {
            // ctx.waitUntil so DO eviction can't drop the usage write.
            this.ctx.waitUntil(
              this.recordTokenUsage(
                usage.inputTokens ?? 0,
                usage.outputTokens ?? 0,
                ESTIMATED_TOKENS_PER_CALL
              ).pipe(
                Effect.tap(() => Effect.promise(() => this.broadcastUsage())),
                Effect.provide(OtelTracingLive),
                Effect.runPromise
              )
            );
          },
        });

        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  }
}
