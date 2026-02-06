import { Effect } from "effect";

import { createAuth } from "../auth";
import { checkSyncAuth, type SyncAuthError } from "../auth/sync-auth";
import { createDb } from "../db";
import { type Env } from "../shared";
import { checkChatFeatureEnabled, type ChatFeatureDisabledError } from "./auth";

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

    const db = createDb(env.DB);
    const auth = createAuth(env, db);
    const cookie = request.headers.get("cookie");

    yield* checkSyncAuth(cookie, lobby.name, auth);
    yield* checkChatFeatureEnabled(lobby.name, env);
  });

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
