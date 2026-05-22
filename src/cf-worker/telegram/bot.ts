import { Effect, Layer } from "effect";
import { Bot, webhookCallback } from "grammy";

import { logSync } from "../logger";
import type { Env } from "../shared";
import { sendConnectPrompt } from "./connect-prompt";
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

const HELP_MESSAGE = `Send me any link to save it to cloudstash.dev.

Commands:
/disconnect — unlink this chat`;

const isConnectWithArgs = (text: string): boolean =>
  /^\/connect(@\w+)?\s+\S/.test(text);

export function createBot(env: Env, publicUrl: string): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (!chatId || !ctx.message) return next();

    const text = ctx.message.text ?? "";
    if (isConnectWithArgs(text) || text === "/disconnect") return next();

    const existing = await env.TELEGRAM_KV.get(`telegram:${chatId}`);
    if (existing) return next();

    logger.info("Unbound chat — sending connect prompt");
    await sendConnectPrompt(ctx, env, chatId, publicUrl);
  });

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
      TelegramSourceAuthLive(env, chatId),
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

  bot.on("message:text", (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const urls = extractUrls(ctx);
    if (urls.length === 0) {
      if (ctx.message.text.startsWith("/")) return;
      logger.info("Text with no links — sending hint");
      return ctx.reply("Please send me a link (or several) to save.");
    }

    logger.info("Links received", { urlCount: urls.length });

    const layer = Layer.mergeAll(
      TelegramMessengerLive(ctx),
      TelegramSourceAuthLive(env, chatId),
      LinkQueueLive(env, chatId, ctx.message.message_id)
    );

    return Effect.runPromise(
      handleLinks(urls).pipe(Effect.provide(layer), Effect.asVoid)
    );
  });

  return bot;
}

export function createWebhookHandler(env: Env, publicUrl: string) {
  return webhookCallback(createBot(env, publicUrl), "cloudflare-mod");
}

export function resolvePublicUrl(env: Env, request: Request): string {
  const configured = env.PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const { protocol, host } = new URL(request.url);
  return `${protocol}//${host}`;
}

export async function handleTelegramWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  return createWebhookHandler(env, resolvePublicUrl(env, request))(request);
}
