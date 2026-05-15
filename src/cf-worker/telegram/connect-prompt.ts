import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";

import { initiateTelegramConnect } from "../connect/telegram";
import { logSync } from "../logger";
import type { Env } from "../shared";

const logger = logSync("Telegram.ConnectPrompt");

const PROMPT_TEXT =
  "👋 Welcome to Cloudstash.\n\nTo save links here, link this chat to your Cloudstash account. Tap below — takes a few seconds.";

export async function sendConnectPrompt(
  ctx: Context,
  env: Env,
  chatId: number,
  publicUrl: string
): Promise<void> {
  try {
    const { url } = await initiateTelegramConnect(env, chatId, publicUrl);
    const keyboard = new InlineKeyboard().url("Connect to Cloudstash", url);
    await ctx.reply(PROMPT_TEXT, { reply_markup: keyboard });
  } catch (error) {
    logger.warn("Failed to send connect prompt", { error: String(error) });
  }
}
