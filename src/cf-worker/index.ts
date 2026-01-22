/// <reference types="@cloudflare/workers-types" />
import '@livestore/adapter-cloudflare/polyfill'
import { Hono } from 'hono'
import { Effect } from 'effect'
import type { CfTypes } from '@livestore/sync-cf/cf-worker'

import { createAuth } from './auth'
import { createDb } from './db'
import { metadataRequestToResponse } from './metadata/service'
import type { Env } from './shared'
import { SyncBackend, handleSyncRequest } from './sync'

export { SyncBackendDO } from './sync'
export { LinkProcessorDO } from './link-processor'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/auth/me', async (c) => {
  const db = createDb(c.env.DB)
  const auth = createAuth(c.env, db)

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  })

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  let organization = null
  if (session.session.activeOrganizationId) {
    const org = await auth.api.getFullOrganization({
      headers: c.req.raw.headers,
      query: { organizationId: session.session.activeOrganizationId },
    })
    if (org) {
      organization = { id: org.id, name: org.name, slug: org.slug }
    }
  }

  return c.json({
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    },
    session: {
      activeOrganizationId: session.session.activeOrganizationId,
    },
    organization,
  })
})

app.get('/api/org/:id', async (c) => {
  const orgId = c.req.param('id')

  const db = createDb(c.env.DB)
  const auth = createAuth(c.env, db)

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  })

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  let org
  try {
    org = await auth.api.getFullOrganization({
      headers: c.req.raw.headers,
      query: { organizationId: orgId },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    if (message.includes('not found') || message.includes('Organization not found')) {
      return c.json({ error: 'Organization not found' }, 404)
    }
    if (message.includes('not a member')) {
      return c.json({ error: 'Access denied' }, 403)
    }
    throw error
  }

  if (!org) {
    return c.json({ error: 'Organization not found' }, 404)
  }

  const member = org.members.find((m) => m.userId === session.user.id)
  if (!member) {
    return c.json({ error: 'Access denied' }, 403)
  }

  return c.json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    role: member.role,
  })
})

app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  const db = createDb(c.env.DB)
  const auth = createAuth(c.env, db)
  return auth.handler(c.req.raw)
})

app.get('/api/metadata', (c) => {
  return Effect.runPromise(metadataRequestToResponse(c.req.raw))
})

export default {
  async fetch(request: CfTypes.Request, env: Env, ctx: CfTypes.ExecutionContext) {
    const searchParams = SyncBackend.matchSyncRequest(request)

    if (searchParams !== undefined) {
      return handleSyncRequest(request, searchParams, ctx, env)
    }

    return app.fetch(request as unknown as Request, env, ctx)
  },
}
