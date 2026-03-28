import { Effect, Layer } from "effect";

import { trackEvent } from "../analytics";
import { AppLayerLive, AuthClient } from "../auth/service";
import { checkSyncAuth } from "../auth/sync-auth";
import type { SyncAuthError } from "../auth/sync-auth";
import { OrgFeaturesLive } from "../org/features-service";
import type { Env } from "../shared";
import { ChatFeatureDisabledError, checkChatFeatureEnabled } from "./auth";

interface Lobby {
  party: string;
  name: string;
}

type ChatAccessError = SyncAuthError | ChatFeatureDisabledError;

const checkChatAgentAccess = (
  request: Request,
  lobby: Lobby,
  env: Env
): Effect.Effect<void, ChatAccessError> =>
  Effect.gen(function* () {
    if (lobby.party !== "chat") return;

    const auth = yield* AuthClient;
    const cookie = request.headers.get("cookie");

    const { userId } = yield* checkSyncAuth(cookie, lobby.name, auth);
    trackEvent(env.USAGE_ANALYTICS, {
      userId,
      event: "chat",
      orgId: lobby.name,
    });
    yield* checkChatFeatureEnabled(lobby.name).pipe(
      Effect.catchTag("DbError", () =>
        Effect.fail(
          new ChatFeatureDisabledError({
            message: "Failed to check features",
            status: 500,
          })
        )
      )
    );
  }).pipe(
    Effect.provide(Layer.provideMerge(OrgFeaturesLive, AppLayerLive(env)))
  );

const errorToResponse = (error: ChatAccessError): Response =>
  new Response(JSON.stringify(error), {
    headers: { "Content-Type": "application/json" },
    status: error.status,
  });

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
