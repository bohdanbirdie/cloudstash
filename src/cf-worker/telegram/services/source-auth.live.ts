import { Effect, Layer } from "effect";

import { AppLayerLive } from "../../auth/service";
import {
  WorkspaceAccess,
  matchWorkspaceAccessError,
} from "../../auth/workspace-access";
import { ApiKey } from "../../db/branded";
import type { Env } from "../../shared";
import {
  TelegramInvalidApiKeyError,
  TelegramAuthUnavailableError,
  TelegramMissingOrgIdError,
  NotConnectedError,
  RateLimitError,
} from "../errors";
import { SourceAuth } from "../services";

const verifyApiKey = Effect.fn("Telegram.verifyApiKey")(function* (
  workspaceAccess: WorkspaceAccess["Service"],
  apiKey: string
) {
  return yield* workspaceAccess.authorizeApiKey(ApiKey.make(apiKey)).pipe(
    Effect.mapError((error) =>
      matchWorkspaceAccessError<
        | TelegramInvalidApiKeyError
        | TelegramMissingOrgIdError
        | RateLimitError
        | TelegramAuthUnavailableError
      >(error, {
        unauthorized: () => new TelegramInvalidApiKeyError({}),
        missingScope: () => new TelegramMissingOrgIdError({}),
        forbidden: () => new TelegramInvalidApiKeyError({}),
        backend: (backend) =>
          backend.operation === "verifyApiKey" &&
          String(backend.cause).includes("Rate limit")
            ? new RateLimitError({})
            : new TelegramAuthUnavailableError({
                cause: backend.cause,
                operation: backend.operation,
              }),
      })
    )
  );
});

export const TelegramSourceAuthLive = (env: Env, chatId: number) =>
  Layer.effect(
    SourceAuth,
    Effect.gen(function* () {
      const workspaceAccess = yield* WorkspaceAccess;
      return SourceAuth.of({
        authenticate: () =>
          Effect.promise(() => env.TELEGRAM_KV.get(`telegram:${chatId}`)).pipe(
            Effect.flatMap((key) =>
              key ? Effect.succeed(key) : Effect.fail(new NotConnectedError({}))
            ),
            Effect.flatMap((apiKey) => verifyApiKey(workspaceAccess, apiKey))
          ),
        verify: (apiKey) => verifyApiKey(workspaceAccess, apiKey),
      });
    })
  ).pipe(Layer.provide(AppLayerLive(env)));
