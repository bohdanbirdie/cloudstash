import { Effect, Match } from "effect";

import { trackEvent } from "../analytics";
import { checkSyncAuth } from "../auth/sync-auth";
import type { SyncAuthError } from "../auth/sync-auth";
import { OrgId } from "../db/branded";
import { maskId } from "../log-utils";
import { OrgNotFoundError } from "../org/errors";
import { getAppLayer } from "../runtime";
import type { Env } from "../shared";
import {
  ChatFeatureDisabledError,
  FeatureCheckUnavailableError,
  UnknownAgentPartyError,
  checkChatFeatureEnabled,
} from "./auth";

interface Lobby {
  className: string;
  name: string;
}

const KNOWN_AGENT_CLASSES = new Set<string>(["Chat"]);

type ChatAccessError =
  | SyncAuthError
  | ChatFeatureDisabledError
  | FeatureCheckUnavailableError
  | UnknownAgentPartyError
  | OrgNotFoundError;

const featureCheckUnavailable = (cause: unknown, orgId: OrgId) =>
  Effect.logError("Feature check unavailable").pipe(
    Effect.annotateLogs({ orgId: maskId(orgId), cause: String(cause) }),
    Effect.flatMap(() =>
      Effect.fail(new FeatureCheckUnavailableError({ cause, orgId }))
    )
  );

const checkChatAgentAccess = (
  request: Request,
  lobby: Lobby,
  env: Env
): Effect.Effect<void, ChatAccessError> => {
  if (!KNOWN_AGENT_CLASSES.has(lobby.className)) {
    return Effect.fail(new UnknownAgentPartyError({ party: lobby.className }));
  }

  const workspaceId = OrgId.make(lobby.name);
  return Effect.gen(function* () {
    const cookie = request.headers.get("cookie");

    const { userId } = yield* checkSyncAuth(cookie, workspaceId);
    trackEvent(env.USAGE_ANALYTICS, {
      userId,
      event: "chat",
      orgId: workspaceId,
    });
    yield* checkChatFeatureEnabled(workspaceId).pipe(
      Effect.catchTag("DbError", (cause) =>
        featureCheckUnavailable(cause, workspaceId)
      )
    );
  }).pipe(
    Effect.withSpan("ChatAgent.checkChatAgentAccess", {
      attributes: { agentClass: lobby.className, orgId: maskId(workspaceId) },
    }),
    Effect.provide(getAppLayer(env)),
    Effect.catchTag("DbError", (cause) =>
      featureCheckUnavailable(cause, workspaceId)
    )
  );
};

const errorToResponse = (error: ChatAccessError): Response =>
  Match.value(error).pipe(
    Match.tag("UnknownAgentPartyError", (e) =>
      Response.json(
        { _tag: e._tag, message: "Unknown agent", party: e.party, status: 404 },
        { status: 404 }
      )
    ),
    Match.tag("SyncAuthError", (e) =>
      Response.json(
        { _tag: e._tag, code: e.code, message: e.message, status: e.status },
        { status: e.status }
      )
    ),
    Match.tag("ChatFeatureDisabledError", (e) =>
      Response.json(
        {
          _tag: e._tag,
          message: "Chat is not included in your current plan",
          status: 403,
        },
        { status: 403 }
      )
    ),
    Match.tag("FeatureCheckUnavailableError", (e) =>
      Response.json(
        {
          _tag: e._tag,
          message: "Failed to check chat feature flag",
          status: 500,
        },
        { status: 500 }
      )
    ),
    Match.tag("OrgNotFoundError", (e) =>
      Response.json(
        { _tag: e._tag, message: "Library not found", status: 404 },
        { status: 404 }
      )
    ),
    Match.exhaustive
  );

const runChatAgentAccess = (
  request: Request,
  lobby: Lobby,
  env: Env
): Promise<Response | undefined> =>
  checkChatAgentAccess(request, lobby, env).pipe(
    Effect.match({
      onFailure: errorToResponse,
      onSuccess: () => undefined,
    }),
    Effect.runPromise
  );

export const agentHooks = {
  onBeforeConnect: runChatAgentAccess,
  onBeforeRequest: runChatAgentAccess,
};
