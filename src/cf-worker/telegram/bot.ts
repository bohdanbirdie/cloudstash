import { Bot, webhookCallback } from 'grammy'

import { logSync } from '../logger'
import type { Env } from '../shared'
import { extractUrls, handleConnect, handleDisconnect, handleLinks } from './handlers'

const logger = logSync('Telegram')

const HELP_MESSAGE = `Send me a link to save it to cloudstash.dev.

Commands:
/connect <api-key> - Connect your account
/disconnect - Disconnect your account`

export function createBot(env: Env): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN)

  bot.command('connect', (ctx) => handleConnect(ctx, env))
  bot.command('disconnect', (ctx) => handleDisconnect(ctx, env))
  bot.command(['start', 'help'], (ctx) => {
    logger.info('/start or /help', { chatId: ctx.chat?.id, from: ctx.from?.username })
    return ctx.reply(HELP_MESSAGE)
  })

  bot.on('message:entities:url', (ctx) => {
    const urls = extractUrls(ctx)
    if (urls.length > 0) return handleLinks(ctx, urls, env)
  })

  bot.on('message:entities:text_link', (ctx) => {
    const urls = extractUrls(ctx)
    if (urls.length > 0) return handleLinks(ctx, urls, env)
  })

  return bot
}

export function createWebhookHandler(env: Env) {
  return webhookCallback(createBot(env), 'cloudflare-mod')
}

export async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token')
  if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Forbidden', { status: 403 })
  }
  return createWebhookHandler(env)(request)
}
