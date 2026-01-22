/// <reference types="@cloudflare/workers-types" />
import '@livestore/adapter-cloudflare/polyfill'
import { Hono } from 'hono'
import { Effect } from 'effect'
import type { CfTypes } from '@livestore/sync-cf/cf-worker'

import { createAuth } from './auth'
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

export default {
  async fetch(request: CfTypes.Request, env: Env, ctx: CfTypes.ExecutionContext) {
    const searchParams = SyncBackend.matchSyncRequest(request)

    if (searchParams !== undefined) {
      return handleSyncRequest(request, searchParams, ctx, env)
    }

    return app.fetch(request as unknown as Request, env, ctx)
  },
}
