import { Effect, Layer } from "effect";

import { type Env } from "../../shared";
import { TelegramKeyStore } from "../services";

export const TelegramKeyStoreLive = (env: Env) =>
  Layer.succeed(TelegramKeyStore, {
    put: (chatId, apiKey) =>
      Effect.promise(() => env.TELEGRAM_KV.put(`telegram:${chatId}`, apiKey)),
    remove: (chatId) =>
      Effect.promise(() => env.TELEGRAM_KV.delete(`telegram:${chatId}`)),
  });
