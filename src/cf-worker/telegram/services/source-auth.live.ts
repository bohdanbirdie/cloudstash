import { Effect, Layer } from "effect";

import { createAuth } from "../../auth";
import { createDb } from "../../db";
import { type Env } from "../../shared";
import {
  InvalidApiKeyError,
  MissingOrgIdError,
  NotConnectedError,
  RateLimitError,
} from "../errors";
import { SourceAuth } from "../services";

const verifyApiKey = (env: Env, apiKey: string) =>
  Effect.gen(function* () {
    const auth = createAuth(env, createDb(env.DB));
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
      return yield* Effect.fail(new InvalidApiKeyError({}));
    }
    if (!result.key.metadata?.orgId) {
      return yield* Effect.fail(new MissingOrgIdError({}));
    }
    return result.key.metadata.orgId as string;
  });

export const TelegramSourceAuthLive = (env: Env, chatId: number) =>
  Layer.succeed(SourceAuth, {
    authenticate: () =>
      Effect.promise(() => env.TELEGRAM_KV.get(`telegram:${chatId}`)).pipe(
        Effect.flatMap((key) =>
          key ? Effect.succeed(key) : Effect.fail(new NotConnectedError({}))
        ),
        Effect.flatMap((apiKey) => verifyApiKey(env, apiKey)),
        Effect.map((orgId) => ({ orgId }))
      ),
    verify: (apiKey) => verifyApiKey(env, apiKey).pipe(Effect.asVoid),
  });
