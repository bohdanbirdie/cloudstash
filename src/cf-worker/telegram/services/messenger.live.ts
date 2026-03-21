import { Effect, Layer } from "effect";
import type { Context } from "grammy";

import { Messenger } from "../services";

export const TelegramMessengerLive = (ctx: Context) =>
  Layer.succeed(Messenger, {
    react: (emoji) =>
      Effect.tryPromise(() =>
        ctx.react(emoji as Parameters<typeof ctx.react>[0])
      ).pipe(Effect.catchAll(() => Effect.void)),
    reply: (text) =>
      Effect.tryPromise(() =>
        ctx.reply(text, {
          reply_parameters: ctx.msg?.message_id
            ? { message_id: ctx.msg.message_id }
            : undefined,
        })
      ).pipe(
        Effect.asVoid,
        Effect.catchAll(() => Effect.void)
      ),
  });
