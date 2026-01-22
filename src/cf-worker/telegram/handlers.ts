import { Effect } from 'effect'
import type { Context } from 'grammy'

import { createAuth } from '../auth'
import { createDb } from '../db'
import { logSync } from '../logger'
import type { Env } from '../shared'
import {
  InvalidApiKeyError,
  MissingApiKeyError,
  MissingChatIdError,
  MissingOrgIdError,
  NotConnectedError,
} from './errors'

const logger = logSync('Telegram')

type Auth = ReturnType<typeof createAuth>

const getChatId = (ctx: Context) =>
  ctx.chat?.id ? Effect.succeed(ctx.chat.id) : Effect.fail(new MissingChatIdError({}))

const verifyApiKey = (auth: Auth, apiKey: string) =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: () => auth.api.verifyApiKey({ body: { key: apiKey } }),
      catch: () => new InvalidApiKeyError({}),
    })
    if (!result.valid || !result.key) return yield* Effect.fail(new InvalidApiKeyError({}))
    if (!result.key.metadata?.orgId) return yield* Effect.fail(new MissingOrgIdError({}))
    return result.key
  })

const connectRequest = (ctx: Context, env: Env) =>
  Effect.gen(function* () {
    const chatId = yield* getChatId(ctx)
    const apiKey = ctx.message?.text?.split(' ')[1]?.trim()
    if (!apiKey) return yield* Effect.fail(new MissingApiKeyError({}))

    const auth = createAuth(env, createDb(env.DB))
    yield* verifyApiKey(auth, apiKey)
    yield* Effect.promise(() => env.TELEGRAM_KV.put(`telegram:${chatId}`, apiKey))

    return 'Connected! Send me any link to save it.'
  })

export const handleConnect = (ctx: Context, env: Env): Promise<void> => {
  logger.info('/connect', { chatId: ctx.chat?.id, from: ctx.from?.username })

  const reply = (msg: string) => Effect.promise(() => ctx.reply(msg))

  return Effect.runPromise(
    connectRequest(ctx, env).pipe(
      Effect.flatMap(reply),
      Effect.catchTags({
        MissingChatIdError: () => reply('Could not determine chat ID.'),
        MissingApiKeyError: () => reply('Usage: /connect <api-key>'),
        InvalidApiKeyError: () => reply('Invalid or expired API key.'),
        MissingOrgIdError: () =>
          reply('API key missing orgId. Please generate a new key from the web app.'),
      }),
      Effect.catchAll((error) =>
        Effect.sync(() => logger.error('Connect error', { error: String(error) })).pipe(
          Effect.flatMap(() => reply('Failed to verify API key. Please try again.')),
        ),
      ),
      Effect.asVoid,
    ),
  )
}

const disconnectRequest = (ctx: Context, env: Env) =>
  Effect.gen(function* () {
    const chatId = yield* getChatId(ctx)
    yield* Effect.promise(() => env.TELEGRAM_KV.delete(`telegram:${chatId}`))
    return 'Disconnected. Use /connect <api-key> to reconnect.'
  })

export const handleDisconnect = (ctx: Context, env: Env): Promise<void> => {
  logger.info('/disconnect', { chatId: ctx.chat?.id, from: ctx.from?.username })

  const reply = (msg: string) => Effect.promise(() => ctx.reply(msg))

  return Effect.runPromise(
    disconnectRequest(ctx, env).pipe(
      Effect.flatMap(reply),
      Effect.catchTag('MissingChatIdError', () => reply('Could not determine chat ID.')),
      Effect.asVoid,
    ),
  )
}

type IngestResult = { url: string; success: true } | { url: string; success: false; error: string }

const ingestUrl = (url: string, apiKey: string, env: Env): Effect.Effect<IngestResult> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise(() =>
      fetch(new URL('/api/ingest', env.BETTER_AUTH_URL).toString(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      }),
    )

    if (!response.ok) {
      const text = yield* Effect.promise(() => response.text())
      const parseResult = Effect.try({
        try: () => (JSON.parse(text) as { error?: string }).error || 'Unknown error',
        catch: () => `HTTP ${response.status}: ${text.slice(0, 100)}`,
      })
      const error = yield* Effect.match(parseResult, { onSuccess: (e) => e, onFailure: (e) => e })
      return { url, success: false, error } as const
    }

    return { url, success: true } as const
  }).pipe(Effect.catchAll((error) => Effect.succeed({ url, success: false, error: String(error) } as const)))

const react = (ctx: Context, emoji: '🤔' | '👍' | '👎') =>
  Effect.tryPromise(() => ctx.react(emoji)).pipe(Effect.catchAll(() => Effect.void))

const linksRequest = (ctx: Context, urls: string[], env: Env) =>
  Effect.gen(function* () {
    const chatId = yield* getChatId(ctx)
    const apiKey = yield* Effect.promise(() => env.TELEGRAM_KV.get(`telegram:${chatId}`)).pipe(
      Effect.flatMap((key) => (key ? Effect.succeed(key) : Effect.fail(new NotConnectedError({})))),
    )

    yield* react(ctx, '🤔')
    const results = yield* Effect.all(urls.map((url) => ingestUrl(url, apiKey, env)))
    const allSuccess = results.every((r) => r.success)

    yield* Effect.sync(() => logger.info('Ingest complete', { chatId, results }))
    yield* react(ctx, allSuccess ? '👍' : '👎')

    const failed = results.filter((r) => !r.success)
    if (failed.length > 0) {
      const failedList = failed.map((r) => `- ${r.url}: ${r.error}`).join('\n')
      yield* Effect.promise(() =>
        ctx.reply(`Failed to save ${failed.length} link(s):\n${failedList}`),
      )
    }
  })

export const handleLinks = (ctx: Context, urls: string[], env: Env): Promise<void> => {
  logger.info('Link received', { chatId: ctx.chat?.id, from: ctx.from?.username, urls })

  return Effect.runPromise(
    linksRequest(ctx, urls, env).pipe(
      Effect.catchTag('NotConnectedError', () =>
        Effect.promise(() => ctx.reply('Please connect first: /connect <api-key>')),
      ),
      Effect.catchTag('MissingChatIdError', () => Effect.void),
      Effect.asVoid,
    ),
  )
}

export const extractUrls = (ctx: Context): string[] => {
  const message = ctx.message
  if (!message?.text || !message?.entities) return []

  return message.entities
    .filter((e) => e.type === 'url' || e.type === 'text_link')
    .map((e) =>
      e.type === 'text_link' && e.url ? e.url : message.text!.slice(e.offset, e.offset + e.length),
    )
}
