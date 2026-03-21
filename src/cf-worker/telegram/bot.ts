import { Effect, Layer } from "effect";
import { Bot, webhookCallback } from "grammy";

import { logSync } from "../logger";
import type { Env } from "../shared";
import {
  extractUrls,
  handleConnect,
  handleDisconnect,
  handleLinks,
} from "./handlers";
import { LinkQueueLive } from "./services/link-queue.live";
import { TelegramMessengerLive } from "./services/messenger.live";
import { TelegramSourceAuthLive } from "./services/source-auth.live";
import { TelegramKeyStoreLive } from "./services/telegram-key-store.live";

const logger = logSync("Telegram");

const HELP_MESSAGE = `Send me a link to save it to cloudstash.dev.

Commands:
/connect <api-key> - Connect your account
/disconnect - Disconnect your account`;

export function createBot(env: Env): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.command("connect", (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    logger.info("/connect");

    const apiKeyText = ctx.message?.text?.split(" ")[1]?.trim();
    const layer = Layer.mergeAll(
      TelegramMessengerLive(ctx),
      TelegramSourceAuthLive(env, chatId),
      TelegramKeyStoreLive(env)
    );

    return Effect.runPromise(
      handleConnect(chatId, apiKeyText).pipe(
        Effect.provide(layer),
        Effect.asVoid
      )
    );
  });

  bot.command("disconnect", (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    logger.info("/disconnect");

    const layer = Layer.mergeAll(
      TelegramMessengerLive(ctx),
      TelegramKeyStoreLive(env)
    );

    return Effect.runPromise(
      handleDisconnect(chatId).pipe(Effect.provide(layer), Effect.asVoid)
    );
  });

  bot.command(["start", "help"], (ctx) => {
    logger.info("/start or /help");
    return ctx.reply(HELP_MESSAGE);
  });

  bot.on("message:entities:url", (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const urls = extractUrls(ctx);
    if (urls.length === 0) return;

    logger.info("Links received", { urlCount: urls.length });

    const layer = Layer.mergeAll(
      TelegramMessengerLive(ctx),
      TelegramSourceAuthLive(env, chatId),
      LinkQueueLive(env, chatId, ctx.message?.message_id)
    );

    return Effect.runPromise(
      handleLinks(urls).pipe(Effect.provide(layer), Effect.asVoid)
    );
  });

  bot.on("message:entities:text_link", (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const urls = extractUrls(ctx);
    if (urls.length === 0) return;

    logger.info("Links received", { urlCount: urls.length });

    const layer = Layer.mergeAll(
      TelegramMessengerLive(ctx),
      TelegramSourceAuthLive(env, chatId),
      LinkQueueLive(env, chatId, ctx.message?.message_id)
    );

    return Effect.runPromise(
      handleLinks(urls).pipe(Effect.provide(layer), Effect.asVoid)
    );
  });

  return bot;
}

export function createWebhookHandler(env: Env) {
  return webhookCallback(createBot(env), "cloudflare-mod");
}

export async function handleTelegramWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  return createWebhookHandler(env)(request);
}
