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

// Re-export DOs for wrangler
export { SyncBackendDO } from './sync'
export { LinkProcessorDO } from './link-processor'

// Create Hono app with typed env bindings
const app = new Hono<{ Bindings: Env }>()

// GET /api/auth/me - Returns current user with org info
app.get('/api/auth/me', async (c) => {
  const db = createDb(c.env.DB)
  const auth = createAuth(c.env, db)

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  })

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // Fetch organization if activeOrganizationId is set
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

// GET /api/org/:id - Returns org if user is a member
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

  // Check if user is a member of this organization
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

  // Check membership
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

// Better Auth catch-all handler
app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  const db = createDb(c.env.DB)
  const auth = createAuth(c.env, db)
  return auth.handler(c.req.raw)
})

// GET /api/metadata - Link metadata extraction
app.get('/api/metadata', (c) => {
  return Effect.runPromise(metadataRequestToResponse(c.req.raw))
})

// GET /api/link-processor - Initialize link processor DO
app.get('/api/link-processor', (c) => {
  const storeId = c.req.query('storeId')
  if (!storeId) {
    return c.text('Missing storeId parameter', 400)
  }

  const processorId = c.env.LINK_PROCESSOR_DO.idFromName(storeId)
  const processor = c.env.LINK_PROCESSOR_DO.get(processorId)

  return processor.fetch(c.req.raw)
})

// Export worker with Hono app + LiveStore sync handling
export default {
  async fetch(request: CfTypes.Request, env: Env, ctx: CfTypes.ExecutionContext) {
    // Check for LiveStore sync request first (WebSocket upgrade)
    const searchParams = SyncBackend.matchSyncRequest(request)

    if (searchParams !== undefined) {
      return handleSyncRequest(request, searchParams, ctx, env)
    }

    // Handle all other routes with Hono
    return app.fetch(request as unknown as Request, env, ctx)
  },
}
