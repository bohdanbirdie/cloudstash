import { Effect, Layer } from "effect";

import type { Auth } from "../../auth";
import { AppLayerLive, AuthClient } from "../../auth/service";
import type { Env } from "../../shared";
import {
  InvalidApiKeyError,
  MissingOrgIdError,
  NotConnectedError,
  RateLimitError,
} from "../errors";
import { SourceAuth } from "../services";

const verifyApiKey = (auth: Auth, apiKey: string) =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      catch: (error) => {
        const message = String(error);
        if (message.includes("Rate limit")) {
          return new RateLimitError({});
        }
        return new InvalidApiKeyError({});
      },
      try: () => auth.api.verifyApiKey({ body: { key: apiKey } }),
    });
    if (!result.valid || !result.key) {
      return yield* new InvalidApiKeyError({});
    }
    const orgId = result.key.metadata?.orgId;
    if (typeof orgId !== "string" || orgId.length === 0) {
      return yield* new MissingOrgIdError({});
    }
    return orgId;
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
            Effect.flatMap((apiKey) => verifyApiKey(auth, apiKey)),
            Effect.map((orgId) => ({ orgId }))
          ),
        verify: (apiKey) => verifyApiKey(auth, apiKey).pipe(Effect.asVoid),
      });
    })
  ).pipe(Layer.provide(AppLayerLive(env)));
