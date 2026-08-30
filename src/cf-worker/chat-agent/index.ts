import { AIChatAgent } from "@cloudflare/ai-chat";
import type { OnChatMessageOptions } from "@cloudflare/ai-chat";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { Connection, ConnectionContext } from "agents";
import {
  streamText,
  generateText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
} from "ai";
import type { LanguageModel } from "ai";
import { Cause, Effect, Match, Option, Schedule, Schema } from "effect";

import { resolveAssistantAllowance } from "../billing/assistant-allowance";
import { StripeClientLive } from "../billing/stripe-client";
import { AssistantUsageWindow } from "../billing/usage-cycle";
import { OrgId } from "../db/branded";
import {
  DurableObjectRetiredError,
  isDurableObjectRetired,
  retireDurableObjectStorage,
} from "../durable-object-retirement";
import { maskId, safeErrorInfo } from "../log-utils";
import {
  OPENROUTER_MODEL_ID,
  openRouterChatSettings,
} from "../openrouter-model";
import { getAppLayer } from "../runtime";
import type { Env } from "../shared";
import { OtelTracingLive } from "../tracing";
import {
  COMPACTION_MAX_OUTPUT_TOKENS,
  COMPACTION_STORAGE_KEY,
  ChatContextSummary,
  buildCompactionPrompt,
  messagesAfterSummary,
  planChatCompaction,
  systemPromptWithSummary,
} from "./compaction";
import type { ChatCompactionPlan } from "./compaction";
import {
  CONTEXT_WINDOW_SIZE,
  MAX_OUTPUT_TOKENS_PER_STEP,
  SYSTEM_PROMPT,
} from "./config";
import {
  extractRetryTime,
  isCreditLimitError,
  isRateLimitError,
} from "./errors";
import { getLastUserMessageText, validateInput } from "./input-validator";
import { makeChatLibrary } from "./library";
import { writeTextMessage } from "./stream-helpers";
import { createChatRetrievalTelemetry, createTools } from "./tools";
import type { ChatRetrievalTelemetry, ToolEffectRunner } from "./tools";
import {
  ALLOWANCE_UNAVAILABLE_MESSAGE,
  CHAT_DISABLED_MESSAGE,
  LIMIT_REACHED_MESSAGE,
  openRouterUsageTelemetry,
  parseAiMeterLimit,
} from "./usage";
import type { ProviderSpend, ProviderUsageTelemetry } from "./usage";

const WORKSPACE_STORAGE_KEY = "chat:workspace-id:v1";
const LAST_TOUCHED_USER_MESSAGE_KEY = "chat:last-touched-user-message:v1";

const ALLOWANCE_OUTCOME = {
  Allowed: "allowed",
  Disabled: "disabled",
  LimitReached: "limit_reached",
  Unavailable: "unavailable",
} as const;
const ResolvedChatAllowance = Schema.Struct({
  enabled: Schema.Boolean,
  limitMicroUsd: Schema.Number,
  unavailable: Schema.Boolean,
  usageWindow: Schema.Option(AssistantUsageWindow),
});
type ResolvedChatAllowance = Schema.Schema.Type<typeof ResolvedChatAllowance>;

class ChatUsageRpcError extends Schema.TaggedErrorClass<ChatUsageRpcError>()(
  "ChatUsageRpcError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  }
) {}

const AllowanceCheck = Schema.Union([
  Schema.Struct({
    outcome: Schema.Literal(ALLOWANCE_OUTCOME.Allowed),
    usageWindow: AssistantUsageWindow,
  }),
  Schema.Struct({
    outcome: Schema.Literals([
      ALLOWANCE_OUTCOME.Disabled,
      ALLOWANCE_OUTCOME.LimitReached,
      ALLOWANCE_OUTCOME.Unavailable,
    ]),
  }),
]);
type AllowanceCheck = Schema.Schema.Type<typeof AllowanceCheck>;

const resolveChatAllowance = Effect.fnUntraced(function* (
  orgId: OrgId,
  limitMicroUsd: number
) {
  const resolved = yield* resolveAssistantAllowance(orgId).pipe(
    Effect.map((allowance) => ({
      credits: allowance.capabilities.monthlyAssistantCredits,
      enabled: allowance.capabilities.chatAgent,
      usageWindow: allowance.usageWindow,
      unavailable: false,
    })),
    Effect.catchTags({
      DbError: (cause) =>
        Effect.logWarning("Assistant allowance lookup failed").pipe(
          Effect.annotateLogs({
            orgId: maskId(orgId),
            ...safeErrorInfo(cause.cause),
          }),
          Effect.as({
            credits: 0,
            enabled: false,
            usageWindow: Option.none(),
            unavailable: true,
          })
        ),
      OrgNotFoundError: () =>
        Effect.logWarning("Assistant workspace is missing").pipe(
          Effect.annotateLogs({ orgId: maskId(orgId) }),
          Effect.as({
            credits: 0,
            enabled: false,
            usageWindow: Option.none(),
            unavailable: true,
          })
        ),
      StripeApiError: (cause) =>
        Effect.logWarning("Assistant Stripe cycle refresh failed").pipe(
          Effect.annotateLogs({
            orgId: maskId(orgId),
            ...safeErrorInfo(cause.cause),
          }),
          Effect.as({
            credits: 0,
            enabled: false,
            usageWindow: Option.none(),
            unavailable: true,
          })
        ),
    })
  );
  return ResolvedChatAllowance.make({
    enabled: resolved.enabled && resolved.credits > 0,
    limitMicroUsd,
    unavailable:
      resolved.unavailable ||
      (resolved.enabled && Option.isNone(resolved.usageWindow)),
    usageWindow: resolved.usageWindow,
  });
});

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
      () => "The Assistant is temporarily unavailable. Please try again later."
    ),
    Match.when(
      "tool_failure",
      () => "I had trouble processing that request. Could you try rephrasing?"
    ),
    Match.when("other", () => "Something went wrong. Please try again."),
    Match.exhaustive
  );
}

export class ChatAgentDO extends AIChatAgent<Env> {
  override __DURABLE_OBJECT_BRAND = "chat-agent-do" as never;
  override maxPersistedMessages = 500;
  private cachedOrgId: OrgId | undefined;
  private retired = false;
  private storeRevision = 0;

  private orgId(): OrgId {
    if (!this.cachedOrgId) {
      throw new Error("Chat workspace has not been bound");
    }
    return this.cachedOrgId;
  }

  private async bindWorkspace(request: Request): Promise<OrgId> {
    const requested = OrgId.make(
      new URL(request.url).searchParams.get("workspaceId") ?? this.name
    );
    const stored = await this.ctx.storage.get<string>(WORKSPACE_STORAGE_KEY);
    if (stored && stored !== requested) {
      throw new Error("Chat session belongs to another workspace");
    }
    if (!stored) await this.ctx.storage.put(WORKSPACE_STORAGE_KEY, requested);
    this.cachedOrgId = OrgId.make(stored ?? requested);
    return this.cachedOrgId;
  }

  private async ensureWorkspace(): Promise<OrgId> {
    if (this.cachedOrgId) return this.cachedOrgId;
    const stored = await this.ctx.storage.get<string>(WORKSPACE_STORAGE_KEY);
    this.cachedOrgId = OrgId.make(stored ?? this.name);
    return this.cachedOrgId;
  }

  override async fetch(request: Request): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (await this.isRetired()) {
        return new Response("Chat retired", { status: 410 });
      }
      return super.fetch(request);
    });
  }

  override async onConnect(connection: Connection, ctx: ConnectionContext) {
    if (await this.isRetired()) {
      connection.close(1001, "Chat retired");
      return;
    }
    try {
      await this.bindWorkspace(ctx.request);
    } catch {
      connection.close(1008, "Invalid chat workspace");
      return;
    }
    await super.onConnect(connection, ctx);
  }

  /** Permanently closes this chat actor and wipes its storage. */
  async retire(): Promise<void> {
    this.retired = true;
    this.storeRevision += 1;
    this.resetTurnState();
    for (const connection of this.getConnections()) {
      connection.close(1001, "Chat retired");
    }
    await Effect.runPromise(
      Effect.gen({ self: this }, function* () {
        yield* Effect.promise(() =>
          retireDurableObjectStorage(this.ctx.storage)
        );
        yield* Effect.logInfo("retire: storage wiped").pipe(
          Effect.annotateLogs({ doId: this.ctx.id.toString() })
        );
      }).pipe(
        Effect.withSpan("ChatAgentDO.retire"),
        Effect.provide(OtelTracingLive)
      )
    );
  }

  private async isRetired(): Promise<boolean> {
    if (this.retired) return true;
    const durable = await isDurableObjectRetired(this.ctx.storage);
    this.retired ||= durable;
    return this.retired;
  }

  private isCurrent(revision: number): boolean {
    return !this.retired && revision === this.storeRevision;
  }

  /** Compatibility target for SyncBackend subscriptions created by old actors. */
  async syncUpdateRpc(
    _payload: Uint8Array<ArrayBuffer>,
    _storeId: string
  ): Promise<void> {}

  private libraryStub() {
    const libraryId = this.env.LINK_PROCESSOR_DO.idFromName(this.orgId());
    return {
      id: libraryId,
      stub: this.env.LINK_PROCESSOR_DO.get(libraryId),
    };
  }

  private async checkAllowance(generation: number): Promise<AllowanceCheck> {
    return Effect.runPromise(
      Effect.gen({ self: this }, function* () {
        const { enabled, limitMicroUsd, unavailable, usageWindow } =
          yield* this.resolveAllowance();
        if (unavailable) {
          yield* Effect.annotateCurrentSpan({
            outcome: ALLOWANCE_OUTCOME.Unavailable,
          });
          return AllowanceCheck.make({
            outcome: ALLOWANCE_OUTCOME.Unavailable,
          });
        }
        if (!enabled) {
          yield* Effect.annotateCurrentSpan({
            outcome: ALLOWANCE_OUTCOME.Disabled,
          });
          return AllowanceCheck.make({
            outcome: ALLOWANCE_OUTCOME.Disabled,
          });
        }
        if (!this.isCurrent(generation)) {
          yield* Effect.logInfo(
            "Assistant allowance check skipped because the actor retired"
          );
          return AllowanceCheck.make({
            outcome: ALLOWANCE_OUTCOME.Unavailable,
          });
        }
        return yield* Option.match(usageWindow, {
          onNone: () =>
            Effect.succeed(
              AllowanceCheck.make({
                outcome: ALLOWANCE_OUTCOME.Unavailable,
              })
            ),
          onSome: (window) =>
            Effect.gen({ self: this }, function* () {
              const { stub } = this.libraryStub();
              const allowed = yield* Effect.tryPromise({
                try: () => stub.canSpendChatUsage(window.id, limitMicroUsd),
                catch: (cause) =>
                  new ChatUsageRpcError({
                    operation: "canSpendChatUsage",
                    cause,
                  }),
              }).pipe(
                Effect.catchTag("ChatUsageRpcError", (error) =>
                  Effect.logError("Assistant allowance RPC failed").pipe(
                    Effect.annotateLogs({
                      operation: error.operation,
                      orgId: maskId(this.orgId()),
                      ...safeErrorInfo(error.cause),
                    }),
                    Effect.as("unavailable" as const)
                  )
                )
              );
              if (allowed === "unavailable") {
                return AllowanceCheck.make({
                  outcome: ALLOWANCE_OUTCOME.Unavailable,
                });
              }
              const outcome = Match.value(allowed).pipe(
                Match.when(true, () => ALLOWANCE_OUTCOME.Allowed),
                Match.when(false, () => ALLOWANCE_OUTCOME.LimitReached),
                Match.exhaustive
              );
              yield* Effect.annotateCurrentSpan({ outcome });
              return Match.value(allowed).pipe(
                Match.when(true, () =>
                  AllowanceCheck.make({
                    outcome: ALLOWANCE_OUTCOME.Allowed,
                    usageWindow: window,
                  })
                ),
                Match.when(false, () =>
                  AllowanceCheck.make({
                    outcome: ALLOWANCE_OUTCOME.LimitReached,
                  })
                ),
                Match.exhaustive
              );
            }),
        });
      }).pipe(
        Effect.withSpan("ChatAgentDO.checkAllowance", {
          attributes: { orgId: maskId(this.orgId()) },
        }),
        Effect.provide(getAppLayer(this.env))
      )
    );
  }

  private recordSpend(
    usageWindowId: string,
    settlementId: string,
    spentMicroUsd: number,
    generation: number
  ): Effect.Effect<void, ChatUsageRpcError> {
    return Effect.gen({ self: this }, function* () {
      if (!this.isCurrent(generation)) {
        yield* Effect.logInfo(
          "Assistant spend write skipped because the actor retired"
        );
        return;
      }
      const { stub } = this.libraryStub();
      const recorded = yield* Effect.tryPromise({
        try: () =>
          stub.settleChatSpend(usageWindowId, settlementId, spentMicroUsd),
        catch: (cause) =>
          new ChatUsageRpcError({
            operation: "settleChatSpend",
            cause,
          }),
      }).pipe(
        Effect.retry({
          schedule: Schedule.exponential("100 millis").pipe(
            Schedule.upTo({ times: 4 })
          ),
        })
      );
      yield* Effect.annotateCurrentSpan({
        recorded,
        spentMicroUsd,
        usageWindowId,
      });
    }).pipe(
      Effect.withSpan("ChatAgentDO.recordSpend", {
        attributes: {
          orgId: maskId(this.orgId()),
        },
      })
    );
  }

  private resolveAllowance() {
    const orgId = this.orgId();
    const limitMicroUsd = parseAiMeterLimit(this.env.AI_METER_LIMIT);
    if (limitMicroUsd === undefined) {
      return Effect.logError(
        "Assistant metering configuration is unavailable"
      ).pipe(
        Effect.annotateLogs({ orgId: maskId(orgId) }),
        Effect.as({
          enabled: false,
          limitMicroUsd: 0,
          unavailable: true,
          usageWindow: Option.none(),
        } satisfies ResolvedChatAllowance)
      );
    }
    return resolveChatAllowance(orgId, limitMicroUsd).pipe(
      Effect.provide(StripeClientLive(this.env)),
      Effect.withSpan("ChatAgentDO.resolveAllowance", {
        attributes: { orgId: maskId(orgId) },
      })
    );
  }

  private async touchCurrentSession(userText: string): Promise<void> {
    const userMessage = this.messages.findLast(
      (message) => message.role === "user"
    );
    if (!userMessage) return;
    const lastTouched = await this.ctx.storage.get<string>(
      LAST_TOUCHED_USER_MESSAGE_KEY
    );
    if (lastTouched === userMessage.id) return;
    const { stub } = this.libraryStub();
    await stub.touchChatSession(this.name, userText);
    await this.ctx.storage.put(LAST_TOUCHED_USER_MESSAGE_KEY, userMessage.id);
  }

  private logMissingProviderCost(stage: "answer" | "compaction"): void {
    this.ctx.waitUntil(
      Effect.logError("OpenRouter response omitted usage cost").pipe(
        Effect.annotateLogs({
          orgId: maskId(this.orgId()),
          stage,
        }),
        Effect.provide(getAppLayer(this.env)),
        Effect.runPromise
      )
    );
  }

  private logProviderUsage(
    stage: "answer" | "compaction",
    telemetry: ProviderUsageTelemetry,
    retrieval?: ChatRetrievalTelemetry
  ): void {
    this.ctx.waitUntil(
      Effect.logInfo("OpenRouter generation usage").pipe(
        Effect.annotateLogs({
          orgId: maskId(this.orgId()),
          stage,
          stepCount: telemetry.stepCount,
          inputTokens: telemetry.inputTokens,
          outputTokens: telemetry.outputTokens,
          cacheReadTokens: telemetry.cacheReadTokens,
          cacheWriteTokens: telemetry.cacheWriteTokens,
          reasoningTokens: telemetry.reasoningTokens,
          spentMicroUsd: telemetry.spend.spentMicroUsd,
          costComplete: telemetry.spend.complete,
          ...(retrieval === undefined
            ? {}
            : {
                retrievalGetCalls: retrieval.getCalls,
                retrievalListCalls: retrieval.listCalls,
                retrievalSearchCalls: retrieval.searchCalls,
                retrievalReturnedItems: retrieval.returnedItems,
                retrievalSerializedCharacters: retrieval.serializedCharacters,
                retrievalCappedCalls: retrieval.cappedCalls,
              }),
        }),
        Effect.provide(getAppLayer(this.env)),
        Effect.runPromise
      )
    );
  }

  private async generateCompaction(
    model: LanguageModel,
    plan: ChatCompactionPlan
  ): Promise<{ summary: ChatContextSummary; spend: ProviderSpend }> {
    const result = await generateText({
      model,
      prompt: buildCompactionPrompt(plan),
      maxOutputTokens: COMPACTION_MAX_OUTPUT_TOKENS,
      experimental_telemetry: { isEnabled: true },
    });
    const summary = {
      summary: result.text,
      throughMessageId: plan.throughMessageId,
      updatedAt: new Date().toISOString(),
    } satisfies ChatContextSummary;
    const telemetry = openRouterUsageTelemetry([
      { usage: result.usage, providerMetadata: result.providerMetadata },
    ]);
    this.logProviderUsage("compaction", telemetry);
    return {
      summary,
      spend: telemetry.spend,
    };
  }

  private async loadStoredSummary(): Promise<ChatContextSummary | undefined> {
    const stored = await this.ctx.storage.get(COMPACTION_STORAGE_KEY);
    if (stored === undefined) return undefined;
    try {
      return await Schema.decodeUnknownPromise(ChatContextSummary)(stored);
    } catch (error) {
      this.ctx.waitUntil(
        Effect.logError("Stored chat compaction summary is invalid").pipe(
          Effect.annotateLogs({
            orgId: maskId(this.orgId()),
            ...safeErrorInfo(error),
          }),
          Effect.provide(getAppLayer(this.env)),
          Effect.runPromise
        )
      );
      return undefined;
    }
  }

  private async persistCompaction(summary: ChatContextSummary): Promise<void> {
    await Effect.runPromise(
      Effect.tryPromise({
        try: () => this.ctx.storage.put(COMPACTION_STORAGE_KEY, summary),
        catch: (cause) =>
          new ChatUsageRpcError({ operation: "persistCompaction", cause }),
      }).pipe(
        Effect.retry({
          schedule: Schedule.exponential("50 millis").pipe(
            Schedule.upTo({ times: 3 })
          ),
        }),
        Effect.provide(getAppLayer(this.env))
      )
    );
  }

  override async onChatMessage(
    _onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0],
    options?: OnChatMessageOptions
  ) {
    if (await this.isRetired()) throw new DurableObjectRetiredError();
    await this.ensureWorkspace();
    const generation = this.storeRevision;

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
      await this.touchCurrentSession(userText);
    }

    const storedSummary = await this.loadStoredSummary();
    const compactionPlan = planChatCompaction(this.messages, storedSummary);

    const allowance = await this.checkAllowance(generation);
    const allowanceOutcome = allowance.outcome;
    if (allowanceOutcome !== ALLOWANCE_OUTCOME.Allowed) {
      const message = Match.value(allowanceOutcome).pipe(
        Match.when(ALLOWANCE_OUTCOME.Disabled, () => CHAT_DISABLED_MESSAGE),
        Match.when(
          ALLOWANCE_OUTCOME.Unavailable,
          () => ALLOWANCE_UNAVAILABLE_MESSAGE
        ),
        Match.when(ALLOWANCE_OUTCOME.LimitReached, () => LIMIT_REACHED_MESSAGE),
        Match.exhaustive
      );
      const blockedStream = createUIMessageStream({
        execute: ({ writer }) => {
          writeTextMessage(writer, message, allowanceOutcome);
        },
      });
      return createUIMessageStreamResponse({ stream: blockedStream });
    }

    const openrouter = createOpenRouter({
      apiKey: this.env.OPENROUTER_API_KEY,
    });
    const providerSessionId = this.ctx.id.toString();
    const model = openrouter(
      OPENROUTER_MODEL_ID,
      openRouterChatSettings(providerSessionId, "assistant")
    );
    const compactionModel = openrouter(
      OPENROUTER_MODEL_ID,
      openRouterChatSettings(providerSessionId, "compaction")
    );

    let summary = storedSummary;
    let compactionSpend: ProviderSpend = {
      complete: true,
      spentMicroUsd: 0,
    };
    if (compactionPlan) {
      try {
        const compacted = await this.generateCompaction(
          compactionModel,
          compactionPlan
        );
        summary = compacted.summary;
        compactionSpend = compacted.spend;
        if (!compacted.spend.complete) {
          this.logMissingProviderCost("compaction");
        }
        try {
          await this.persistCompaction(compacted.summary);
        } catch (error) {
          this.ctx.waitUntil(
            Effect.logError("Chat context compaction could not be saved").pipe(
              Effect.annotateLogs({
                ...safeErrorInfo(error),
                orgId: maskId(this.orgId()),
              }),
              Effect.provide(getAppLayer(this.env)),
              Effect.runPromise
            )
          );
        }
      } catch (error) {
        this.ctx.waitUntil(
          Effect.logWarning("Chat context compaction failed").pipe(
            Effect.annotateLogs({
              ...safeErrorInfo(error),
              orgId: maskId(this.orgId()),
            }),
            Effect.provide(getAppLayer(this.env)),
            Effect.runPromise
          )
        );
      }
    }

    const { id: libraryId, stub: libraryStub } = this.libraryStub();
    const library = makeChatLibrary({
      callRpc: (payload) =>
        libraryStub.workspaceLinksRpc(Uint8Array.from(payload)),
      durableObjectId: libraryId.toString(),
    });
    const runToolEffect: ToolEffectRunner = (effect) =>
      effect.pipe(Effect.provide(getAppLayer(this.env)), Effect.runPromise);
    const retrievalTelemetry = createChatRetrievalTelemetry();
    const tools = createTools(library, runToolEffect, retrievalTelemetry);

    return this.handleNormalChat(
      model,
      tools,
      generation,
      allowance.usageWindow.id,
      summary,
      compactionSpend,
      retrievalTelemetry,
      options?.abortSignal
    );
  }

  private handleNormalChat(
    model: LanguageModel,
    tools: ReturnType<typeof createTools>,
    generation: number,
    usageWindowId: string,
    summary: ChatContextSummary | undefined,
    compactionSpend: ProviderSpend,
    retrievalTelemetry: ReturnType<typeof createChatRetrievalTelemetry>,
    abortSignal?: AbortSignal
  ) {
    const settlementId = crypto.randomUUID();
    let usageSettlementStarted = false;
    const settleUsage = (spend: ProviderSpend) => {
      if (usageSettlementStarted || !this.isCurrent(generation)) return;
      usageSettlementStarted = true;
      if (!spend.complete) this.logMissingProviderCost("answer");
      const spentMicroUsd = compactionSpend.spentMicroUsd + spend.spentMicroUsd;
      if (spentMicroUsd === 0) return;
      this.ctx.waitUntil(
        this.recordSpend(
          usageWindowId,
          settlementId,
          spentMicroUsd,
          generation
        ).pipe(
          Effect.tapCause((cause) =>
            Effect.logError("recordSpend failed").pipe(
              Effect.annotateLogs({
                cause: Cause.pretty(cause),
                orgId: maskId(this.orgId()),
                settlementId,
                spentMicroUsd,
                usageWindowId,
              })
            )
          ),
          Effect.provide(getAppLayer(this.env)),
          Effect.runPromise
        )
      );
    };
    const onError = (error: unknown) => {
      settleUsage({ complete: false, spentMicroUsd: 0 });
      this.ctx.waitUntil(
        Effect.logError("Chat stream failed").pipe(
          Effect.annotateLogs({
            ...safeErrorInfo(error),
            errorKind: classifyError(error),
            orgId: maskId(this.orgId()),
          }),
          Effect.provide(getAppLayer(this.env)),
          Effect.runPromise
        )
      );
      return formatError(error);
    };
    const stream = createUIMessageStream({
      onError,
      execute: async ({ writer }) => {
        const recentMessages = messagesAfterSummary(
          this.messages,
          summary
        ).slice(-CONTEXT_WINDOW_SIZE);
        const messages = await convertToModelMessages(recentMessages);

        const result = streamText({
          model,
          system: systemPromptWithSummary(SYSTEM_PROMPT, summary),
          messages,
          tools,
          abortSignal,
          maxOutputTokens: MAX_OUTPUT_TOKENS_PER_STEP,
          stopWhen: stepCountIs(5),
          experimental_telemetry: { isEnabled: true },
          onFinish: ({ steps }) => {
            const telemetry = openRouterUsageTelemetry(steps);
            this.logProviderUsage(
              "answer",
              telemetry,
              retrievalTelemetry.snapshot()
            );
            settleUsage(telemetry.spend);
          },
        });

        writer.merge(result.toUIMessageStream({ onError }));
      },
    });

    return createUIMessageStreamResponse({ stream });
  }
}
