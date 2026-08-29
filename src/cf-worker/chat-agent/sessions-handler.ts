import { Effect, Layer, Match, Option } from "effect";

import { checkSyncAuth } from "../auth/sync-auth";
import type { SyncAuthError } from "../auth/sync-auth";
import { resolveAssistantAllowance } from "../billing/assistant-allowance";
import type { StripeApiError } from "../billing/errors";
import type { AssistantAllowance } from "../billing/service";
import { StripeClientLive } from "../billing/stripe-client";
import { OrgId } from "../db/branded";
import type { DbError } from "../db/service";
import type { OrgNotFoundError } from "../org/errors";
import { getAppLayer } from "../runtime";
import type { Env } from "../shared";
import type { ChatFeatureDisabledError } from "./auth";
import { ChatFeatureDisabledError as ChatFeatureDisabled } from "./auth";
import type { ChatSession } from "./sessions";
import { CHAT_SESSION_LIMIT } from "./sessions";
import { assistantCreditStatus, parseAiMeterLimit } from "./usage";

const missingWorkspace = () =>
  Response.json({ error: "Missing workspaceId" }, { status: 400 });

const authorize = (request: Request, workspaceId: OrgId, env: Env) =>
  Effect.gen(function* () {
    yield* checkSyncAuth(request.headers.get("cookie"), workspaceId);
    const allowance = yield* resolveAssistantAllowance(workspaceId);
    if (!allowance.capabilities.chatAgent) {
      return yield* new ChatFeatureDisabled({ orgId: workspaceId });
    }
    return allowance;
  }).pipe(Effect.provide(Layer.merge(getAppLayer(env), StripeClientLive(env))));

type AuthorizationError =
  | SyncAuthError
  | ChatFeatureDisabledError
  | DbError
  | OrgNotFoundError
  | StripeApiError;

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

const withAuthorizedProcessor = async (
  request: Request,
  env: Env,
  operation: (authorized: {
    allowance: AssistantAllowance;
    processor: DurableObjectStub<
      import("../link-processor/durable-object").LinkProcessorDO
    >;
  }) => Promise<Response>
): Promise<Response> => {
  const rawWorkspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!rawWorkspaceId) return missingWorkspace();
  const workspaceId = OrgId.make(rawWorkspaceId);
  const auth = await authorize(request, workspaceId, env).pipe(
    Effect.match({
      onFailure: authorizationError,
      onSuccess: (capabilities) => capabilities,
    }),
    Effect.runPromise
  );
  if (auth instanceof Response) return auth;
  return operation({
    allowance: auth,
    processor: env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(workspaceId)
    ),
  });
};

const sessionsResponse = async (
  processor: DurableObjectStub<
    import("../link-processor/durable-object").LinkProcessorDO
  >,
  sessions: readonly ChatSession[],
  allowance: AssistantAllowance,
  env: Env
) => {
  const limitMicroUsd = parseAiMeterLimit(env.AI_METER_LIMIT);
  if (limitMicroUsd === undefined) return { sessions };
  return Option.match(allowance.usageWindow, {
    onNone: () => ({ sessions }),
    onSome: async (window) => ({
      sessions,
      assistantCredits: assistantCreditStatus(
        await processor.getChatUsage(window.id),
        allowance.capabilities.monthlyAssistantCredits,
        limitMicroUsd,
        window.resetsAt
      ),
    }),
  });
};

export const handleListChatSessions = (
  request: Request,
  env: Env
): Promise<Response> =>
  withAuthorizedProcessor(request, env, async ({ allowance, processor }) =>
    Response.json(
      await sessionsResponse(
        processor,
        await processor.listChatSessions(),
        allowance,
        env
      )
    )
  );

export const handleCreateChatSession = (
  request: Request,
  env: Env
): Promise<Response> =>
  withAuthorizedProcessor(request, env, async ({ allowance, processor }) => {
    const result = await processor.createChatSession();
    if (result.ok) {
      return Response.json(
        await sessionsResponse(processor, result.sessions, allowance, env),
        { status: 201 }
      );
    }
    return Response.json(
      {
        error: `A library can keep up to ${CHAT_SESSION_LIMIT} chats. Delete one before starting another.`,
      },
      { status: 409 }
    );
  });

export const handleDeleteChatSession = (
  request: Request,
  agentName: string,
  env: Env
): Promise<Response> =>
  withAuthorizedProcessor(request, env, async ({ allowance, processor }) => {
    const result = await processor.deleteChatSession(agentName);
    if (result.ok) {
      return Response.json(
        await sessionsResponse(processor, result.sessions, allowance, env)
      );
    }
    return Response.json({ error: "Chat session not found." }, { status: 404 });
  });
