import { Effect, Layer, Schema } from "effect";

import type { Auth } from "../../auth";
import { AppLayerLive, AuthClient } from "../../auth/service";
import { OrgId, UserId } from "../../db/branded";
import type { Env } from "../../shared";
import {
  TelegramInvalidApiKeyError,
  TelegramMissingOrgIdError,
  NotConnectedError,
  RateLimitError,
} from "../errors";
import { SourceAuth } from "../services";

const verifyApiKey = Effect.fn("Telegram.verifyApiKey")(function* (
  auth: Auth,
  apiKey: string
) {
  const result = yield* Effect.tryPromise({
    catch: (error) => {
      const message = String(error);
      if (message.includes("Rate limit")) {
        return new RateLimitError({});
      }
      return new TelegramInvalidApiKeyError({});
    },
    try: () => auth.api.verifyApiKey({ body: { key: apiKey } }),
  });
  if (!result.valid || !result.key) {
    return yield* new TelegramInvalidApiKeyError({});
  }
  const orgId = result.key.metadata?.orgId;
  if (typeof orgId !== "string" || orgId.length === 0) {
    return yield* new TelegramMissingOrgIdError({});
  }
  const userId = yield* Schema.decodeUnknown(UserId)(
    result.key.referenceId
  ).pipe(Effect.mapError(() => new TelegramInvalidApiKeyError({})));
  return { orgId: OrgId.make(orgId), userId };
});

export const TelegramSourceAuthLive = (env: Env, chatId: number) =>
  Layer.effect(
    SourceAuth,
    Effect.gen(function* () {
      const auth = yield* AuthClient;
      return SourceAuth.of({
        authenticate: () =>
          Effect.promise(() => env.TELEGRAM_KV.get(`telegram:${chatId}`)).pipe(
            Effect.flatMap((key) =>
              key ? Effect.succeed(key) : Effect.fail(new NotConnectedError({}))
            ),
            Effect.flatMap((apiKey) => verifyApiKey(auth, apiKey))
          ),
        verify: (apiKey) => verifyApiKey(auth, apiKey),
      });
    })
  ).pipe(Layer.provide(AppLayerLive(env)));
