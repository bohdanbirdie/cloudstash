import { Effect, Layer, Match, Option, Schema } from "effect";

import { checkSyncAuth } from "../auth/sync-auth";
import type { SyncAuthError } from "../auth/sync-auth";
import { resolveAssistantAllowance } from "../billing/assistant-allowance";
import type { StripeApiError } from "../billing/errors";
import type { AssistantAllowance } from "../billing/service";
import { StripeClientLive } from "../billing/stripe-client";
import { OrgId } from "../db/branded";
import type { DbError } from "../db/service";
import { maskId, safeErrorInfo } from "../log-utils";
import type { OrgNotFoundError } from "../org/errors";
import { getAppLayer } from "../runtime";
import type { Env } from "../shared";
import type { ChatFeatureDisabledError } from "./auth";
import { ChatFeatureDisabledError as ChatFeatureDisabled } from "./auth";
import type { ChatSession, ChatSessionRegistryResult } from "./sessions";
import { CHAT_SESSION_LIMIT } from "./sessions";
import { assistantCreditStatus, parseAiMeterLimit } from "./usage";

const missingWorkspace = () =>
  Response.json({ error: "Missing workspaceId" }, { status: 400 });

const authorize = Effect.fn("ChatSessions.authorize")(function* (
  request: Request,
  workspaceId: OrgId
) {
  yield* checkSyncAuth(request.headers.get("cookie"), workspaceId);
  const allowance = yield* resolveAssistantAllowance(workspaceId);
  if (!allowance.capabilities.chatAgent) {
    return yield* new ChatFeatureDisabled({ orgId: workspaceId });
  }
  return allowance;
});

class ChatSessionsRpcError extends Schema.TaggedErrorClass<ChatSessionsRpcError>()(
  "ChatSessionsRpcError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  }
) {}

type AuthorizationError =
  | SyncAuthError
  | ChatFeatureDisabledError
  | DbError
  | OrgNotFoundError
  | StripeApiError;

type HandlerError = AuthorizationError | ChatSessionsRpcError;

const processorRpc = Effect.fn("ChatSessions.processorRpc")(function* <A>(
  operation: string,
  run: () => Promise<A>
) {
  return yield* Effect.tryPromise({
    try: run,
    catch: (cause) => new ChatSessionsRpcError({ cause, operation }),
  });
});

const logHandlerError = (error: HandlerError, workspaceId: OrgId) =>
  Match.value(error).pipe(
    Match.tag("SyncAuthError", () => Effect.void),
    Match.tag("ChatFeatureDisabledError", () => Effect.void),
    Match.tag("OrgNotFoundError", () =>
      Effect.logWarning("Chat sessions workspace is missing").pipe(
        Effect.annotateLogs({ orgId: maskId(workspaceId) })
      )
    ),
    Match.tag("DbError", ({ cause }) =>
      Effect.logError("Chat sessions authorization database failed").pipe(
        Effect.annotateLogs({
          orgId: maskId(workspaceId),
          ...safeErrorInfo(cause),
        })
      )
    ),
    Match.tag("StripeApiError", ({ cause }) =>
      Effect.logError("Chat sessions Stripe refresh failed").pipe(
        Effect.annotateLogs({
          orgId: maskId(workspaceId),
          ...safeErrorInfo(cause),
        })
      )
    ),
    Match.tag("ChatSessionsRpcError", ({ cause, operation }) =>
      Effect.logError("Chat sessions Durable Object RPC failed").pipe(
        Effect.annotateLogs({
          operation,
          orgId: maskId(workspaceId),
          ...safeErrorInfo(cause),
        })
      )
    ),
    Match.exhaustive
  );

const authorizationError = (error: AuthorizationError) =>
  Match.value(error).pipe(
    Match.tag("SyncAuthError", (syncError) =>
      Response.json(syncError, {
        status: syncError.status as 401 | 403 | 503,
      })
    ),
    Match.tag("ChatFeatureDisabledError", () =>
      Response.json({ error: "Chat is unavailable" }, { status: 403 })
    ),
    Match.orElse(() =>
      Response.json(
        { error: "Chat is temporarily unavailable" },
        { status: 503 }
      )
    )
  );

const handlerErrorResponse = (error: HandlerError): Response =>
  Match.value(error).pipe(
    Match.tag("ChatSessionsRpcError", () =>
      Response.json(
        { error: "Chat is temporarily unavailable" },
        { status: 503 }
      )
    ),
    Match.orElse(authorizationError)
  );

const withAuthorizedProcessor = async (
  request: Request,
  env: Env,
  operation: (authorized: {
    allowance: AssistantAllowance;
    processor: DurableObjectStub<
      import("../link-processor/durable-object").LinkProcessorDO
    >;
  }) => Effect.Effect<Response, ChatSessionsRpcError>
): Promise<Response> => {
  const rawWorkspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!rawWorkspaceId) return missingWorkspace();
  const workspaceId = OrgId.make(rawWorkspaceId);
  return Effect.gen(function* () {
    const allowance = yield* authorize(request, workspaceId);
    const processor = env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(workspaceId)
    );
    return yield* operation({ allowance, processor });
  }).pipe(
    Effect.tapError((error) => logHandlerError(error, workspaceId)),
    Effect.match({
      onFailure: handlerErrorResponse,
      onSuccess: (response) => response,
    }),
    Effect.provide(Layer.merge(getAppLayer(env), StripeClientLive(env))),
    Effect.runPromise
  );
};

const sessionsResponse = Effect.fn("ChatSessions.sessionsResponse")(function* (
  processor: DurableObjectStub<
    import("../link-processor/durable-object").LinkProcessorDO
  >,
  sessions: readonly ChatSession[],
  allowance: AssistantAllowance,
  env: Env
) {
  const limitMicroUsd = parseAiMeterLimit(env.AI_METER_LIMIT);
  if (limitMicroUsd === undefined) return { sessions };
  return yield* Option.match(allowance.usageWindow, {
    onNone: () => Effect.succeed({ sessions }),
    onSome: (window) =>
      processorRpc("getChatUsage", () =>
        processor.getChatUsage(window.id)
      ).pipe(
        Effect.map((usage) => ({
          sessions,
          assistantCredits: assistantCreditStatus(
            usage,
            allowance.capabilities.monthlyAssistantCredits,
            limitMicroUsd,
            window.resetsAt
          ),
        }))
      ),
  });
});

const listSessions = (
  processor: DurableObjectStub<
    import("../link-processor/durable-object").LinkProcessorDO
  >
) => processorRpc("listChatSessions", () => processor.listChatSessions());

const createSession = (
  processor: DurableObjectStub<
    import("../link-processor/durable-object").LinkProcessorDO
  >
) =>
  processorRpc<ChatSessionRegistryResult>("createChatSession", () =>
    processor.createChatSession()
  );

const deleteSession = (
  processor: DurableObjectStub<
    import("../link-processor/durable-object").LinkProcessorDO
  >,
  agentName: string
) =>
  processorRpc<ChatSessionRegistryResult>("deleteChatSession", () =>
    processor.deleteChatSession(agentName)
  );

export const handleListChatSessions = (
  request: Request,
  env: Env
): Promise<Response> =>
  withAuthorizedProcessor(request, env, ({ allowance, processor }) =>
    Effect.gen(function* () {
      const sessions = yield* listSessions(processor);
      const body = yield* sessionsResponse(processor, sessions, allowance, env);
      return Response.json(body);
    })
  );

export const handleCreateChatSession = (
  request: Request,
  env: Env
): Promise<Response> =>
  withAuthorizedProcessor(request, env, ({ allowance, processor }) =>
    Effect.gen(function* () {
      const result = yield* createSession(processor);
      if (result.ok) {
        const body = yield* sessionsResponse(
          processor,
          result.sessions,
          allowance,
          env
        );
        return Response.json(body, { status: 201 });
      }
      return Response.json(
        {
          error: `A library can keep up to ${CHAT_SESSION_LIMIT} chats. Delete one before starting another.`,
        },
        { status: 409 }
      );
    })
  );

export const handleDeleteChatSession = (
  request: Request,
  agentName: string,
  env: Env
): Promise<Response> =>
  withAuthorizedProcessor(request, env, ({ allowance, processor }) =>
    Effect.gen(function* () {
      const result = yield* deleteSession(processor, agentName);
      if (result.ok) {
        const body = yield* sessionsResponse(
          processor,
          result.sessions,
          allowance,
          env
        );
        return Response.json(body);
      }
      return Response.json(
        { error: "Chat session not found." },
        { status: 404 }
      );
    })
  );
