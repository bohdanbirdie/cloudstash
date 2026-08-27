import { AIChatAgent } from "@cloudflare/ai-chat";
import type { OnChatMessageOptions } from "@cloudflare/ai-chat";
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

import { normalizeLinkSearchQuery } from "../../lib/link-search";
import type { LinkStatus } from "../../livestore/queries/filtered-links";
import {
  apiLinksCount$,
  apiLinksPage$,
  searchLinks$,
} from "../../livestore/queries/links";
import type { SearchResult } from "../../livestore/queries/schemas";
import { pendingTagsByLink$, tagsByLink$ } from "../../livestore/queries/tags";
import { schema } from "../../livestore/schema";
import type { StoreEvent } from "../../livestore/schema";
import { Billing } from "../billing/service";
import { OrgId } from "../db/branded";
import {
  DurableObjectRetiredError,
  isDurableObjectRetired,
  retireDurableObjectStorage,
} from "../durable-object-retirement";
import type { ApiLinksPage } from "../links/api";
import { encodeLinksPage, mergeTagNamesByLink } from "../links/api";
import { maskId } from "../log-utils";
import { getAppLayer } from "../runtime";
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
  private storePromise: Promise<Store<typeof schema>> | null = null;
  private cachedOrgId: OrgId | undefined;
  private retired = false;
  private storeRevision = 0;

  private orgId(): OrgId {
    if (!this.cachedOrgId) this.cachedOrgId = OrgId.make(this.name);
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
    await super.onConnect(connection, ctx);
    void this.broadcastUsage(this.storeRevision);
  }

  /** Permanently closes this chat actor and wipes its storage. */
  async retire(): Promise<void> {
    this.retired = true;
    this.storeRevision += 1;
    this.resetTurnState();
    for (const connection of this.getConnections()) {
      connection.close(1001, "Chat retired");
    }
    const storePromise = this.storePromise?.catch(() => null);
    this.storePromise = null;
    await Effect.runPromise(
      Effect.gen({ self: this }, function* () {
        yield* Effect.promise(() =>
          retireDurableObjectStorage(this.ctx.storage, async () => {
            const store = await storePromise;
            await store?.shutdownPromise?.();
          })
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

  private async getSessionId(
    storeId: string,
    generation: number
  ): Promise<string> {
    if (!this.isCurrent(generation)) {
      throw new DurableObjectRetiredError();
    }
    const key = "chat-session-id";
    const stored = await this.ctx.storage.get<string>(key);
    if (stored) return stored;

    const newSessionId = `chat-${storeId}-${nanoid()}`;
    if (!this.isCurrent(generation)) {
      throw new DurableObjectRetiredError();
    }
    await this.ctx.storage.put(key, newSessionId);
    return newSessionId;
  }

  private getStore(storeId?: string): Promise<Store<typeof schema>> {
    const generation = this.storeRevision;
    const existing = this.storePromise;
    if (existing) return existing;

    const id = storeId ?? this.name;
    const promise = (async () => {
      if (await this.isRetired()) throw new DurableObjectRetiredError();
      const sessionId = await this.getSessionId(id, generation);
      const store = await createStoreDoPromise({
        clientId: "chat-agent-do",
        durableObject: {
          bindingName: "Chat",
          ctx: this.ctx,
          env: this.env,
        } as never,
        livePull: true,
        schema,
        sessionId,
        storeId: id,
        syncBackendStub: this.env.SYNC_BACKEND_DO.get(
          this.env.SYNC_BACKEND_DO.idFromName(id)
        ) as never,
      });
      if (!this.isCurrent(generation)) {
        await store.shutdownPromise?.();
        throw new DurableObjectRetiredError();
      }
      return store;
    })();
    promise.catch(() => {
      if (this.storePromise === promise) this.storePromise = null;
    });
    this.storePromise = promise;
    return promise;
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

  private commitFor(
    store: Store<typeof schema>,
    revision: number
  ): (...storeEvents: StoreEvent[]) => void {
    return (...storeEvents) => {
      if (!this.isCurrent(revision)) throw new DurableObjectRetiredError();
      return store.commit(...storeEvents);
    };
  }

  async syncUpdateRpc(
    payload: Uint8Array<ArrayBuffer>,
    storeId: string
  ): Promise<void> {
    if (await this.isRetired()) return;
    const generation = this.storeRevision;
    await this.getStore(storeId);
    await this.ctx.blockConcurrencyWhile(async () => {
      if (!this.isCurrent(generation)) return;
      await handleSyncUpdateRpc(this.ctx, payload);
    });
  }

  // Read-only keyset page over this org's links, exposed to the public links
  // API. Reuses the per-org store this DO already hosts for chat.
  async listLinks(params: {
    state: LinkStatus;
    limit: number;
    cursor: { createdAt: number; id: string } | null;
  }): Promise<ApiLinksPage> {
    return Effect.runPromise(
      Effect.gen({ self: this }, function* () {
        const store = yield* Effect.promise(() => this.getStore());
        const rows = store.query(
          apiLinksPage$({
            state: params.state,
            limitPlusOne: params.limit + 1,
            cursor: params.cursor,
          })
        );
        const tagRows = store.query(tagsByLink$);
        const pendingTagRows = store.query(pendingTagsByLink$);
        const total = store.query(apiLinksCount$(params.state));
        return encodeLinksPage(
          rows,
          mergeTagNamesByLink(tagRows, pendingTagRows),
          total,
          params.limit
        );
      }).pipe(
        Effect.withSpan("ChatAgentDO.listLinks", {
          attributes: {
            orgId: maskId(this.orgId()),
            state: params.state,
            limit: params.limit,
          },
        }),
        Effect.provide(getAppLayer(this.env))
      )
    );
  }

  // Bounded ranked search over this org's links for read-only external callers.
  async searchLinks(params: {
    query: string;
  }): Promise<readonly SearchResult[]> {
    const query = normalizeLinkSearchQuery(params.query);
    if (query === null) return [];

    return Effect.runPromise(
      Effect.gen({ self: this }, function* () {
        const store = yield* Effect.promise(() => this.getStore());
        return store.query(searchLinks$(query));
      }).pipe(
        Effect.withSpan("ChatAgentDO.searchLinks", {
          attributes: {
            orgId: maskId(this.orgId()),
            queryLength: query.length,
          },
        }),
        Effect.provide(getAppLayer(this.env))
      )
    );
  }

  private usageStorage(
    storage: Pick<DurableObjectStorage, "get" | "put"> = this.ctx.storage
  ): UsageStorage {
    const key = getUsageKey(getCurrentPeriod());
    return {
      get: () => storage.get<UsageData>(key),
      put: (data) => storage.put(key, data),
    };
  }

  private async reserveTokens(
    estimate: number,
    generation: number
  ): Promise<ReserveOutcome> {
    return Effect.runPromise(
      Effect.gen({ self: this }, function* () {
        const { limit, unavailable } = yield* this.resolveBudget();
        if (unavailable) {
          yield* Effect.annotateCurrentSpan({
            outcome: RESERVE_OUTCOME.Unavailable,
          });
          return RESERVE_OUTCOME.Unavailable;
        }
        const reserved = yield* Effect.promise(() =>
          this.ctx.storage.transaction((transaction) =>
            this.isCurrent(generation)
              ? reserveTokensIn(this.usageStorage(transaction), estimate, limit)
              : Promise.resolve(null)
          )
        );
        if (reserved === null) {
          yield* Effect.logInfo(
            "Token reservation skipped because the actor retired"
          );
          return RESERVE_OUTCOME.Unavailable;
        }
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
    releaseReservation: number,
    generation: number
  ): Effect.Effect<void> {
    return Effect.gen({ self: this }, function* () {
      const committed = yield* Effect.promise(() =>
        this.ctx.storage.transaction(async (transaction) => {
          if (!this.isCurrent(generation)) return false;
          await reconcileTokenUsageIn(
            this.usageStorage(transaction),
            promptTokens,
            completionTokens,
            releaseReservation
          );
          return true;
        })
      );
      if (!committed) {
        yield* Effect.logInfo(
          "Token usage write skipped because the actor retired"
        );
      }
    }).pipe(
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
    return Effect.gen({ self: this }, function* () {
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

  private broadcastUsage(generation: number): Promise<void> {
    return this.getUsage().pipe(
      Effect.tap((usage) =>
        Effect.sync(() => {
          if (this.isCurrent(generation)) this.setState({ usage });
        })
      ),
      Effect.tapCause((cause) =>
        Effect.logError("broadcastUsage failed").pipe(
          Effect.annotateLogs({ cause: String(cause) })
        )
      ),
      Effect.asVoid,
      Effect.provide(getAppLayer(this.env)),
      Effect.runPromise
    );
  }

  override async onChatMessage(
    _onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0],
    options?: OnChatMessageOptions
  ) {
    if (await this.isRetired()) throw new DurableObjectRetiredError();
    const generation = this.storeRevision;
    await this.broadcastUsage(generation);

    const reserveOutcome = await this.reserveTokens(
      ESTIMATED_TOKENS_PER_CALL,
      generation
    );
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
    const commit = this.commitFor(store, generation);
    const tools = createTools(store, commit);
    const toolExecutors = createToolExecutors(store, commit);

    const lastMessage = this.messages[this.messages.length - 1];
    if (hasToolConfirmation(lastMessage)) {
      return this.handleToolConfirmation(
        model,
        tools,
        toolExecutors,
        generation,
        options?.abortSignal
      );
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

    return this.handleNormalChat(
      model,
      tools,
      generation,
      options?.abortSignal
    );
  }

  private handleToolConfirmation(
    model: LanguageModel,
    tools: ReturnType<typeof createTools>,
    toolExecutors: ReturnType<typeof createToolExecutors>,
    generation: number,
    abortSignal?: AbortSignal
  ) {
    const stream = createUIMessageStream({
      onError: formatError,
      execute: async ({ writer }) => {
        const updatedMessages = await processToolCalls(
          { messages: this.messages, tools },
          toolExecutors
        );

        if (!this.isCurrent(generation)) return;

        this.messages = updatedMessages;
        await this.persistMessages(this.messages);

        const recentMessages = this.messages.slice(-CONTEXT_WINDOW_SIZE);
        const messages = await convertToModelMessages(recentMessages);

        const result = streamText({
          model,
          system: SYSTEM_PROMPT,
          messages,
          tools,
          abortSignal,
          stopWhen: stepCountIs(5),
          experimental_telemetry: { isEnabled: true },
          onFinish: ({ usage }) => {
            if (!this.isCurrent(generation)) return;
            // ctx.waitUntil so DO eviction can't drop the usage write.
            this.ctx.waitUntil(
              this.recordTokenUsage(
                usage.inputTokens ?? 0,
                usage.outputTokens ?? 0,
                ESTIMATED_TOKENS_PER_CALL,
                generation
              ).pipe(
                Effect.tap(() =>
                  Effect.promise(() => this.broadcastUsage(generation))
                ),
                Effect.tapCause((cause) =>
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
    tools: ReturnType<typeof createTools>,
    generation: number,
    abortSignal?: AbortSignal
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
          abortSignal,
          stopWhen: stepCountIs(5),
          experimental_telemetry: { isEnabled: true },
          onFinish: ({ usage }) => {
            if (!this.isCurrent(generation)) return;
            // ctx.waitUntil so DO eviction can't drop the usage write.
            this.ctx.waitUntil(
              this.recordTokenUsage(
                usage.inputTokens ?? 0,
                usage.outputTokens ?? 0,
                ESTIMATED_TOKENS_PER_CALL,
                generation
              ).pipe(
                Effect.tap(() =>
                  Effect.promise(() => this.broadcastUsage(generation))
                ),
                Effect.tapCause((cause) =>
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
