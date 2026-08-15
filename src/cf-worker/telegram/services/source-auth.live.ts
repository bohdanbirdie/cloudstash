import { Effect, Layer } from "effect";

import { AppLayerLive } from "../../auth/service";
import { WorkspaceAccess } from "../../auth/workspace-access";
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
  return yield* workspaceAccess
    .authorize({ _tag: "ApiKey", apiKey: ApiKey.make(apiKey) })
    .pipe(
      Effect.catchTags({
        WorkspaceCredentialInvalidError: () =>
          Effect.fail(new TelegramInvalidApiKeyError({})),
        WorkspaceScopeMissingError: () =>
          Effect.fail(new TelegramMissingOrgIdError({})),
        WorkspaceApiKeyReferenceMissingError: () =>
          Effect.fail(new TelegramInvalidApiKeyError({})),
        WorkspaceScopeMismatchError: () =>
          Effect.fail(new TelegramInvalidApiKeyError({})),
        WorkspaceUserUnapprovedError: () =>
          Effect.fail(new TelegramInvalidApiKeyError({})),
        WorkspaceMembershipRevokedError: () =>
          Effect.fail(new TelegramInvalidApiKeyError({})),
        WorkspaceAccessBackendError: (error) =>
          error.operation === "verifyApiKey" &&
          String(error.cause).includes("Rate limit")
            ? Effect.fail(new RateLimitError({}))
            : Effect.fail(
                new TelegramAuthUnavailableError({
                  cause: error.cause,
                  operation: error.operation,
                })
              ),
      })
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
