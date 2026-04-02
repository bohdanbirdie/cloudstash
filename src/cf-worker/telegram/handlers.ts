import { Effect } from "effect";
import type { Context } from "grammy";

import { safeErrorInfo } from "../log-utils";
import { logSync } from "../logger";
import { LinkQueue, Messenger, SourceAuth, TelegramKeyStore } from "./services";

const logger = logSync("Telegram");

export const handleLinks = (urls: string[]) =>
  Effect.gen(function* () {
    const messenger = yield* Messenger;
    const auth = yield* SourceAuth;
    const queue = yield* LinkQueue;

    const { orgId } = yield* auth.authenticate();

    yield* messenger.draft("Saving link");

    const enqueueResult = yield* Effect.all(
      urls.map((url) => queue.enqueue(url, orgId))
    ).pipe(
      Effect.as("ok" as const),
      Effect.catchAll((error) => {
        logger.error("Queue send failed", safeErrorInfo(error));
        return Effect.succeed("failed" as const);
      })
    );

    if (enqueueResult === "failed") {
      yield* messenger.reply("Failed to save link. Please try again later.");
    } else {
      yield* Effect.sync(() =>
        logger.info("Links queued", { count: urls.length })
      );
    }
  }).pipe(
    Effect.withSpan("Telegram.handleLinks"),
    Effect.catchTags({
      NotConnectedError: () =>
        Messenger.pipe(
          Effect.flatMap((m) =>
            m.reply("Please connect first: /connect <api-key>")
          )
        ),
      InvalidApiKeyError: () =>
        Messenger.pipe(
          Effect.flatMap((m) =>
            m.reply(
              "Your API key is no longer valid. Please reconnect: /connect <new-api-key>"
            )
          )
        ),
      RateLimitError: () =>
        Messenger.pipe(
          Effect.flatMap((m) =>
            m.reply("Too many links today. Please try again tomorrow.")
          )
        ),
      MissingOrgIdError: () =>
        Messenger.pipe(
          Effect.flatMap((m) =>
            m.reply(
              "API key missing orgId. Please generate a new key from the web app."
            )
          )
        ),
    })
  );

export const handleConnect = (chatId: number, apiKeyText: string | undefined) =>
  Effect.gen(function* () {
    const messenger = yield* Messenger;
    const auth = yield* SourceAuth;
    const keyStore = yield* TelegramKeyStore;

    if (!apiKeyText) {
      return yield* messenger.reply("Usage: /connect <api-key>");
    }

    yield* auth.verify(apiKeyText);
    yield* keyStore.put(chatId, apiKeyText);
    yield* messenger.reply("Connected! Send me any link to save it.");
  }).pipe(
    Effect.withSpan("Telegram.handleConnect"),
    Effect.catchTags({
      InvalidApiKeyError: () =>
        Messenger.pipe(
          Effect.flatMap((m) => m.reply("Invalid or expired API key."))
        ),
      MissingOrgIdError: () =>
        Messenger.pipe(
          Effect.flatMap((m) =>
            m.reply(
              "API key missing orgId. Please generate a new key from the web app."
            )
          )
        ),
      RateLimitError: () =>
        Messenger.pipe(
          Effect.flatMap((m) =>
            m.reply("Too many requests. Please try again later.")
          )
        ),
    })
  );

export const handleDisconnect = (chatId: number) =>
  Effect.gen(function* () {
    const messenger = yield* Messenger;
    const keyStore = yield* TelegramKeyStore;

    yield* keyStore.remove(chatId);
    yield* messenger.reply(
      "Disconnected. Use /connect <api-key> to reconnect."
    );
  }).pipe(Effect.withSpan("Telegram.handleDisconnect"));

export const extractUrls = (ctx: Context): string[] => {
  const { message } = ctx;
  if (!message?.text || !message?.entities) {
    return [];
  }

  return message.entities
    .filter((e) => e.type === "url" || e.type === "text_link")
    .map((e) =>
      e.type === "text_link" && e.url
        ? e.url
        : message.text!.slice(e.offset, e.offset + e.length)
    );
};
