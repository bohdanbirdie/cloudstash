import { Effect, Layer, Match } from "effect";

import { trackEvent } from "../analytics";
import { AppLayerLive, AuthClient } from "../auth/service";
import { checkSyncAuth } from "../auth/sync-auth";
import type { SyncAuthError } from "../auth/sync-auth";
import { OrgId } from "../db/branded";
import { maskId } from "../log-utils";
import { OrgFeaturesLive } from "../org/features-service";
import type { Env } from "../shared";
import {
  ChatFeatureDisabledError,
  FeatureCheckUnavailableError,
  UnknownAgentPartyError,
  checkChatFeatureEnabled,
} from "./auth";

interface Lobby {
  party: string;
  name: string;
}

const KNOWN_PARTIES = new Set<string>(["chat"]);

type ChatAccessError =
  | SyncAuthError
  | ChatFeatureDisabledError
  | FeatureCheckUnavailableError
  | UnknownAgentPartyError;

const checkChatAgentAccess = (
  request: Request,
  lobby: Lobby,
  env: Env
): Effect.Effect<void, ChatAccessError> =>
  Effect.gen(function* () {
    if (!KNOWN_PARTIES.has(lobby.party)) {
      return yield* new UnknownAgentPartyError({
        message: "Unknown agent",
        party: lobby.party,
        status: 404,
      });
    }

    const auth = yield* AuthClient;
    const cookie = request.headers.get("cookie");
    const workspaceId = OrgId.make(lobby.name);

    const { userId } = yield* checkSyncAuth(cookie, workspaceId, auth);
    trackEvent(env.USAGE_ANALYTICS, {
      userId,
      event: "chat",
      orgId: lobby.name,
    });
    yield* checkChatFeatureEnabled(workspaceId).pipe(
      Effect.catchTag("DbError", (cause) =>
        Effect.gen(function* () {
          yield* Effect.logError("Feature check unavailable").pipe(
            Effect.annotateLogs({ orgId: lobby.name })
          );
          return yield* new FeatureCheckUnavailableError({
            cause,
            message: "Failed to check chat feature flag",
            status: 500,
          });
        })
      )
    );
  }).pipe(
    Effect.withSpan("ChatAgent.checkChatAgentAccess", {
      attributes: { orgId: maskId(lobby.name), party: lobby.party },
    }),
    Effect.provide(Layer.provideMerge(OrgFeaturesLive, AppLayerLive(env)))
  );

const errorToResponse = (error: ChatAccessError): Response => {
  const payload = Match.value(error).pipe(
    Match.tag("UnknownAgentPartyError", (e) => ({
      _tag: e._tag,
      message: e.message,
      status: e.status,
      party: e.party,
    })),
    Match.tag("SyncAuthError", (e) => ({
      _tag: e._tag,
      message: e.message,
      status: e.status,
      code: e.code,
    })),
    Match.tag("ChatFeatureDisabledError", (e) => ({
      _tag: e._tag,
      message: e.message,
      status: e.status,
    })),
    Match.tag("FeatureCheckUnavailableError", (e) => ({
      _tag: e._tag,
      message: e.message,
      status: e.status,
    })),
    Match.exhaustive
  );
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status: error.status,
  });
};

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
