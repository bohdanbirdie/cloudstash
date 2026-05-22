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
import { Effect, Match } from "effect";

import { schema } from "../../livestore/schema";
import { Billing } from "../billing/service";
import { OrgId } from "../db/branded";
import { maskId } from "../log-utils";
import { getAppLayer } from "../runtime";
import type { Env } from "../shared";
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
  BUDGET_UNAVAILABLE_MESSAGE,
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

const RESERVE_OUTCOME = {
  Reserved: "reserved",
  LimitReached: "limit_reached",
  Unavailable: "unavailable",
} as const;
type ReserveOutcome = (typeof RESERVE_OUTCOME)[keyof typeof RESERVE_OUTCOME];

type ChatErrorKind = "rate_limit" | "credit_limit" | "tool_failure" | "other";

const TOOL_FAILURE_PATTERNS = [
  /tool_use_failed/,
  /tool_calls/,
  /Failed to call a function/,
  /tool call validation failed/,
];

function classifyError(error: unknown): ChatErrorKind {
  if (isRateLimitError(error)) return "rate_limit";
  if (isCreditLimitError(error)) return "credit_limit";
  const msg = error instanceof Error ? error.message : String(error);
  if (TOOL_FAILURE_PATTERNS.some((r) => r.test(msg))) return "tool_failure";
  return "other";
}

function formatError(error: unknown): string {
  return Match.value(classifyError(error)).pipe(
    Match.when(
      "rate_limit",
      () =>
        `I've hit my rate limit. Please try again in ${extractRetryTime(error)}.`
    ),
    Match.when(
      "credit_limit",
      () => "I've reached my spending limit. Please try again later."
    ),
    Match.when(
      "tool_failure",
      () => "I had trouble processing that request. Could you try rephrasing?"
    ),
    Match.when("other", () => "Something went wrong. Please try again."),
    Match.exhaustive
  );
}

export class ChatAgentDO
  extends AIChatAgent<Env>
  implements ClientDoWithRpcCallback
{
  override __DURABLE_OBJECT_BRAND = "chat-agent-do" as never;
  private cachedStore: Store<typeof schema> | undefined;
  private cachedOrgId: OrgId | undefined;

  private orgId(): OrgId {
    if (!this.cachedOrgId) this.cachedOrgId = OrgId.make(this.name);
    return this.cachedOrgId;
  }

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
        Effect.provide(getAppLayer(this.env))
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

  private async reserveTokens(estimate: number): Promise<ReserveOutcome> {
    return Effect.runPromise(
      Effect.gen(this, function* () {
        const { limit, unavailable } = yield* this.resolveBudget();
        if (unavailable) {
          yield* Effect.annotateCurrentSpan({
            outcome: RESERVE_OUTCOME.Unavailable,
          });
          return RESERVE_OUTCOME.Unavailable;
        }
        const storage = this.usageStorage();
        const reserved = yield* Effect.promise(() =>
          this.ctx.blockConcurrencyWhile(() =>
            reserveTokensIn(storage, estimate, limit)
          )
        );
        const outcome = reserved
          ? RESERVE_OUTCOME.Reserved
          : RESERVE_OUTCOME.LimitReached;
        yield* Effect.annotateCurrentSpan({ estimate, limit, outcome });
        return outcome;
      }).pipe(
        Effect.withSpan("ChatAgentDO.reserveTokens", {
          attributes: { orgId: maskId(this.orgId()) },
        }),
        Effect.provide(getAppLayer(this.env))
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
          orgId: maskId(this.orgId()),
          promptTokens,
          releaseReservation,
        },
      })
    );
  }

  private resolveBudget(): Effect.Effect<
    { budget: number; limit: number; unavailable: boolean },
    never,
    Billing
  > {
    const orgId = this.orgId();
    return Effect.gen(function* () {
      const billing = yield* Billing;
      const resolved = yield* billing.capabilities(orgId).pipe(
        Effect.map((caps) => ({
          budget: caps.monthlyChatBudgetUsd,
          unavailable: false,
        })),
        Effect.catchTags({
          DbError: (cause) =>
            Effect.logWarning("Falling back to default budget").pipe(
              Effect.annotateLogs({
                cause: String(cause),
                orgId: maskId(orgId),
              }),
              Effect.as({ budget: 0, unavailable: true })
            ),
          OrgNotFoundError: () =>
            Effect.logWarning("Org missing — using default budget").pipe(
              Effect.annotateLogs({ orgId: maskId(orgId) }),
              Effect.as({ budget: 0, unavailable: true })
            ),
        })
      );
      return {
        budget: resolved.budget,
        limit: budgetToTokenLimit(resolved.budget),
        unavailable: resolved.unavailable,
      };
    }).pipe(
      Effect.withSpan("ChatAgentDO.resolveBudget", {
        attributes: { orgId: maskId(orgId) },
      })
    );
  }

  private getUsage(): Effect.Effect<
    NonNullable<ChatAgentState["usage"]>,
    never,
    Billing
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
    }).pipe(
      Effect.withSpan("ChatAgentDO.getUsage", {
        attributes: { orgId: maskId(this.orgId()) },
      })
    );
  }

  private broadcastUsage(): Promise<void> {
    return this.getUsage().pipe(
      Effect.tap((usage) => Effect.sync(() => this.setState({ usage }))),
      Effect.tapErrorCause((cause) =>
        Effect.logError("broadcastUsage failed").pipe(
          Effect.annotateLogs({ cause: String(cause) })
        )
      ),
      Effect.asVoid,
      Effect.provide(getAppLayer(this.env)),
      Effect.runPromise
    );
  }

  override async onChatMessage() {
    await this.broadcastUsage();

    const reserveOutcome = await this.reserveTokens(ESTIMATED_TOKENS_PER_CALL);
    if (reserveOutcome !== RESERVE_OUTCOME.Reserved) {
      const message =
        reserveOutcome === RESERVE_OUTCOME.Unavailable
          ? BUDGET_UNAVAILABLE_MESSAGE
          : LIMIT_REACHED_MESSAGE;
      const blockedStream = createUIMessageStream({
        execute: ({ writer }) => {
          writeTextMessage(writer, message, reserveOutcome);
        },
      });
      return createUIMessageStreamResponse({ stream: blockedStream });
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
                Effect.tapErrorCause((cause) =>
                  Effect.logError("recordTokenUsage failed").pipe(
                    Effect.annotateLogs({ cause: String(cause) })
                  )
                ),
                Effect.provide(getAppLayer(this.env)),
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
                Effect.tapErrorCause((cause) =>
                  Effect.logError("recordTokenUsage failed").pipe(
                    Effect.annotateLogs({ cause: String(cause) })
                  )
                ),
                Effect.provide(getAppLayer(this.env)),
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
