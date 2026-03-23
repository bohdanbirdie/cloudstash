import { Effect, Layer } from "effect";
import type { Context } from "grammy";

import { Messenger } from "../services";

export const TelegramMessengerLive = (ctx: Context) =>
  Layer.succeed(Messenger, {
    draft: (text) =>
      Effect.tryPromise(() => ctx.replyWithDraft(text)).pipe(
        Effect.asVoid,
        Effect.catchAll((error) =>
          Effect.logWarning("Telegram messenger: draft failed").pipe(
            Effect.annotateLogs({ error: String(error) })
          )
        )
      ),
    reply: (text) =>
      Effect.tryPromise(() =>
        ctx.reply(text, {
          reply_parameters: ctx.msg?.message_id
            ? { message_id: ctx.msg.message_id }
            : undefined,
        })
      ).pipe(
        Effect.asVoid,
        Effect.catchAll((error) =>
          Effect.logWarning("Telegram messenger: reply failed").pipe(
            Effect.annotateLogs({ error: String(error) })
          )
        )
      ),
  });
