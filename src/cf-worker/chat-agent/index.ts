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
import { Effect, Match, Option, Schema } from "effect";

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
import { OPENROUTER_MODEL_ID } from "../openrouter-model";
import { getAppLayer } from "../runtime";
import type { Env } from "../shared";
import { OtelTracingLive } from "../tracing";
import {
  COMPACTION_MAX_OUTPUT_TOKENS,
  COMPACTION_STORAGE_KEY,
  buildCompactionPrompt,
  messagesAfterSummary,
  planChatCompaction,
  systemPromptWithSummary,
} from "./compaction";
import type { ChatCompactionPlan, ChatContextSummary } from "./compaction";
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
import { createTools } from "./tools";
import type { ToolEffectRunner } from "./tools";
import {
  ALLOWANCE_UNAVAILABLE_MESSAGE,
  CHAT_DISABLED_MESSAGE,
  LIMIT_REACHED_MESSAGE,
  openRouterSpend,
  parseAiMeterLimit,
} from "./usage";
import type { ProviderSpend } from "./usage";

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
            cause: String(cause),
            orgId: maskId(orgId),
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
            cause: String(cause),
            orgId: maskId(orgId),
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
              const allowed = yield* Effect.promise(() =>
                stub.canSpendChatUsage(window.id, limitMicroUsd)
              );
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
  ): Effect.Effect<void> {
    return Effect.gen({ self: this }, function* () {
      if (!this.isCurrent(generation)) {
        yield* Effect.logInfo(
          "Assistant spend write skipped because the actor retired"
        );
        return;
      }
      const { stub } = this.libraryStub();
      yield* Effect.promise(() =>
        stub.settleChatSpend(usageWindowId, settlementId, spentMicroUsd)
      );
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

  private async compactContext(
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
    await this.ctx.storage.put(COMPACTION_STORAGE_KEY, summary);
    return {
      summary,
      spend: openRouterSpend([result.providerMetadata]),
    };
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

    const storedSummary = await this.ctx.storage.get<ChatContextSummary>(
      COMPACTION_STORAGE_KEY
    );
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
        Match.orElse(() => ALLOWANCE_UNAVAILABLE_MESSAGE)
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
    const model = openrouter(OPENROUTER_MODEL_ID);

    let summary = storedSummary;
    let compactionSpend: ProviderSpend = {
      complete: true,
      spentMicroUsd: 0,
    };
    if (compactionPlan) {
      try {
        const compacted = await this.compactContext(model, compactionPlan);
        summary = compacted.summary;
        compactionSpend = compacted.spend;
        if (!compacted.spend.complete) {
          this.logMissingProviderCost("compaction");
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
    const tools = createTools(library, runToolEffect);

    return this.handleNormalChat(
      model,
      tools,
      generation,
      allowance.usageWindow.id,
      summary,
      compactionSpend,
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
    abortSignal?: AbortSignal
  ) {
    const settlementId = crypto.randomUUID();
    let usageSettled = false;
    const settleUsage = (spend: ProviderSpend) => {
      if (usageSettled || !this.isCurrent(generation)) return;
      usageSettled = true;
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
              Effect.annotateLogs({ cause: String(cause) })
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
            settleUsage(
              openRouterSpend(steps.map((step) => step.providerMetadata))
            );
          },
        });

        writer.merge(result.toUIMessageStream({ onError }));
      },
    });

    return createUIMessageStreamResponse({ stream });
  }
}
