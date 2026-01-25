/// <reference types="@cloudflare/workers-types" />
import '@livestore/adapter-cloudflare/polyfill'
import { Hono } from 'hono'
import { Effect } from 'effect'
import type { CfTypes } from '@livestore/sync-cf/cf-worker'

import { createAuth } from './auth'
import { checkSyncAuth, SyncAuthError } from './auth/sync-auth'
import { createDb } from './db'
import { ingestRequestToResponse } from './ingest/service'
import { metadataRequestToResponse } from './metadata/service'
import { handleGetMe, handleGetOrg } from './org'
import type { Env } from './shared'
import { SyncBackend, handleSyncRequest } from './sync'
import { handleTelegramWebhook } from './telegram'

export { SyncBackendDO } from './sync'
export { LinkProcessorDO } from './link-processor'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/auth/me', (c) => handleGetMe(c.req.raw, c.env))

app.get('/api/org/:id', (c) => handleGetOrg(c.req.raw, c.req.param('id'), c.env))

app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  const db = createDb(c.env.DB)
  const auth = createAuth(c.env, db)
  return auth.handler(c.req.raw)
})

app.get('/api/metadata', (c) => Effect.runPromise(metadataRequestToResponse(c.req.raw)))

app.post('/api/ingest', (c) => Effect.runPromise(ingestRequestToResponse(c.req.raw, c.env)))

app.post('/api/telegram', (c) => handleTelegramWebhook(c.req.raw, c.env))

// Check sync auth - called by client to get error reason when sync fails
app.get('/api/sync/auth', async (c) => {
  const storeId = c.req.query('storeId')
  if (!storeId) {
    return c.json({ error: 'Missing storeId' }, 400)
  }

  const db = createDb(c.env.DB)
  const auth = createAuth(c.env, db)
  const cookie = c.req.header('cookie') ?? null

  const result = await checkSyncAuth(cookie, storeId, auth).pipe(
    Effect.match({
      onSuccess: () => ({ ok: true as const }),
      onFailure: (error) => error,
    }),
    Effect.runPromise,
  )

  if ('ok' in result) {
    return c.json(result)
  }
  return c.json(result, result.status as 401 | 403)
})

// LiveStore sync endpoint - handled separately due to WebSocket upgrade
const handleSync = async (
  request: CfTypes.Request,
  env: Env,
  ctx: CfTypes.ExecutionContext,
): Promise<Response> => {
  const searchParams = SyncBackend.matchSyncRequest(request)

  if (!searchParams) {
    return new Response(JSON.stringify({ error: 'Invalid sync request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const db = createDb(env.DB)
  const auth = createAuth(env, db)
  const cookie = request.headers.get('cookie')

  const authResult = await checkSyncAuth(cookie, searchParams.storeId, auth).pipe(
    Effect.match({
      onSuccess: () => null,
      onFailure: (error) => error,
    }),
    Effect.runPromise,
  )

  if (authResult instanceof SyncAuthError) {
    return new Response(JSON.stringify(authResult), {
      status: authResult.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return handleSyncRequest(request, searchParams, ctx, env) as unknown as Response
}

export default {
  async fetch(request: CfTypes.Request, env: Env, ctx: CfTypes.ExecutionContext) {
    const url = new URL(request.url)

    if (url.pathname === '/sync') {
      return handleSync(request, env, ctx)
    }

    return app.fetch(request as unknown as Request, env, ctx)
  },
}
