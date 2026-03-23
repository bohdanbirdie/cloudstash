import { Effect, Layer, Match, Schema } from "effect";
import { Api } from "grammy";

import type { NotifyPayload, SourceContext } from "../services";
import { SourceNotifier } from "../services";

const TelegramMeta = Schema.Struct({
  chatId: Schema.optional(Schema.Number),
  messageId: Schema.optional(Schema.Number),
});

const decodeMeta = Schema.decodeUnknown(Schema.parseJson(TelegramMeta));

const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const formatTags = (tags: string[]) =>
  tags
    .map((t) => `#${escapeHtml(t.replaceAll(" ", "_").replaceAll("-", "_"))}`)
    .join(" ");

export const formatPayload = (payload: NotifyPayload): string =>
  Match.value(payload).pipe(
    Match.when(
      { processingStatus: "failed" },
      () => "Link saved, but enrichment failed (metadata/summary unavailable)."
    ),
    Match.when(
      { processingStatus: "completed" },
      ({ summary, suggestedTags }) => {
        const parts = ["Link saved!"];
        if (summary) {
          parts.push(`<blockquote>${escapeHtml(summary)}</blockquote>`);
        }
        if (suggestedTags.length > 0) {
          parts.push(formatTags(suggestedTags));
        }
        return parts.join("\n\n");
      }
    ),
    Match.exhaustive
  );

const resolveTelegramMeta = (ctx: SourceContext) =>
  Effect.gen(function* () {
    if (ctx.source !== "telegram" || !ctx.sourceMeta) return null;

    const meta = yield* decodeMeta(ctx.sourceMeta).pipe(
      Effect.catchAll((error) =>
        Effect.logWarning("Failed to decode source metadata").pipe(
          Effect.annotateLogs({ error: String(error), source: ctx.source }),
          Effect.as(null)
        )
      )
    );

    return meta;
  });

export const SourceNotifierLive = (telegramBotToken: string) => {
  const api = new Api(telegramBotToken);

  return Layer.succeed(SourceNotifier, {
    streamProgress: (ctx, text) =>
      Effect.gen(function* () {
        const meta = yield* resolveTelegramMeta(ctx);
        if (!meta?.chatId || !meta.messageId) return;

        yield* Effect.tryPromise(() =>
          api.sendMessageDraft(meta.chatId!, meta.messageId!, text)
        );
      }).pipe(
        Effect.catchAll((error) =>
          Effect.logWarning("Telegram API: draft progress failed").pipe(
            Effect.annotateLogs({ error: String(error), source: ctx.source })
          )
        )
      ),

    finalizeProgress: (ctx, payload) =>
      Effect.gen(function* () {
        const meta = yield* resolveTelegramMeta(ctx);
        if (!meta?.chatId) return;

        const text = formatPayload(payload);
        yield* Effect.tryPromise(() =>
          api.sendMessage(meta.chatId!, text, {
            parse_mode: "HTML",
            reply_parameters: meta.messageId
              ? { message_id: meta.messageId }
              : undefined,
          })
        );
      }).pipe(
        Effect.catchAll((error) =>
          Effect.logWarning("Telegram API: finalize failed").pipe(
            Effect.annotateLogs({ error: String(error), source: ctx.source })
          )
        )
      ),

    reply: (ctx, text) =>
      Effect.gen(function* () {
        const meta = yield* resolveTelegramMeta(ctx);
        if (!meta?.chatId) return;

        yield* Effect.tryPromise(() =>
          api.sendMessage(meta.chatId!, text, {
            reply_parameters: meta.messageId
              ? { message_id: meta.messageId }
              : undefined,
          })
        );
      }).pipe(
        Effect.catchAll((error) =>
          Effect.logWarning("Telegram API: reply failed").pipe(
            Effect.annotateLogs({ error: String(error), source: ctx.source })
          )
        )
      ),
  });
};
