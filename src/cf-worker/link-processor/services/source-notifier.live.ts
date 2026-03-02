import { Effect, Layer } from "effect";
import { Api } from "grammy";
import { type ReactionTypeEmoji } from "grammy/types";

import { SourceNotifier } from "../services";

export const SourceNotifierLive = (telegramBotToken: string) =>
  Layer.succeed(SourceNotifier, {
    react: (source, sourceMeta, emoji) =>
      Effect.gen(function* () {
        if (source !== "telegram" || !sourceMeta) return;

        const meta = JSON.parse(sourceMeta) as {
          chatId?: number;
          messageId?: number;
        };
        if (!meta.chatId || !meta.messageId) return;

        const api = new Api(telegramBotToken);
        yield* Effect.promise(() =>
          api.setMessageReaction(meta.chatId!, meta.messageId!, [
            { type: "emoji", emoji } as ReactionTypeEmoji,
          ])
        );
      }).pipe(
        Effect.catchAll((error) =>
          Effect.logWarning("Source reaction failed").pipe(
            Effect.annotateLogs({ error: String(error), source })
          )
        )
      ),

    reply: (source, sourceMeta, text) =>
      Effect.gen(function* () {
        if (source !== "telegram" || !sourceMeta) return;

        const meta = JSON.parse(sourceMeta) as {
          chatId?: number;
          messageId?: number;
        };
        if (!meta.chatId) return;

        const api = new Api(telegramBotToken);
        yield* Effect.promise(() =>
          api.sendMessage(meta.chatId!, text, {
            reply_parameters: meta.messageId
              ? { message_id: meta.messageId }
              : undefined,
          })
        );
      }).pipe(
        Effect.catchAll((error) =>
          Effect.logWarning("Source reply failed").pipe(
            Effect.annotateLogs({ error: String(error), source })
          )
        )
      ),
  });
