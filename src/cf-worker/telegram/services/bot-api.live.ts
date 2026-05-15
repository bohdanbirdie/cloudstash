import { Effect, Layer } from "effect";
import { Api } from "grammy";

import { TelegramBotApi, TelegramBotApiError } from "../services";

export const TelegramBotApiLive = (botToken: string) => {
  const api = new Api(botToken);
  return Layer.succeed(TelegramBotApi, {
    sendMessage: (chatId, text) =>
      Effect.tryPromise({
        try: () => api.sendMessage(chatId, text),
        catch: (cause) => new TelegramBotApiError({ op: "sendMessage", cause }),
      }).pipe(Effect.asVoid),
    getMe: () =>
      Effect.tryPromise({
        try: () => api.getMe(),
        catch: (cause) => new TelegramBotApiError({ op: "getMe", cause }),
      }).pipe(Effect.map((me) => ({ username: me.username ?? null }))),
  });
};
