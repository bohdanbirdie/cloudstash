/// <reference types="@cloudflare/workers-types" />
import '@livestore/adapter-cloudflare/polyfill'
import { Effect } from 'effect'
import type { CfTypes } from '@livestore/sync-cf/cf-worker'
import * as SyncBackend from '@livestore/sync-cf/cf-worker'
import { jwtVerify, createLocalJWKSet } from 'jose'

import { SyncPayload } from '../livestore/schema'
import { createAuth, type Auth } from './auth'
import { createDb } from './db'
import { metadataRequestToResponse } from './metadata/service'
import type { Env } from './shared'

export { LinkProcessorDO } from './link-processor'

// Current SyncBackendDO instance - set in constructor so it's always available
let currentSyncBackend: {
  triggerLinkProcessor: (storeId: string) => void
} | null = null

export class SyncBackendDO extends SyncBackend.makeDurableObject({
  onPush: async (message, context) => {
    const hasLinkCreated = message.batch.some((event) => event.name === 'v1.LinkCreated')
    if (hasLinkCreated && currentSyncBackend) {
      currentSyncBackend.triggerLinkProcessor(context.storeId)
    }
  },
}) {
  private _env: Env

  constructor(ctx: CfTypes.DurableObjectState, env: Env) {
    super(ctx, env)
    this._env = env
    currentSyncBackend = this
  }

  triggerLinkProcessor(storeId: string) {
    console.log('[triggerLinkProcessor] waking up processor for:', storeId)
    const processorId = this._env.LINK_PROCESSOR_DO.idFromName(storeId)
    const processor = this._env.LINK_PROCESSOR_DO.get(processorId)
    processor
      .fetch(`https://link-processor/?storeId=${storeId}`)
      .then(() => console.log('[triggerLinkProcessor] processor fetch succeeded'))
      .catch((error: unknown) => console.error('[triggerLinkProcessor] failed:', error))
  }
}

const validatePayload = async (
  payload: typeof SyncPayload.Type | undefined,
  context: { storeId: string },
  env: Env,
  auth: Auth,
) => {
  if (!payload?.authToken) {
    throw new Error('Missing auth token')
  }

  // Get JWKS via Better Auth handler (keeps coupling to public API, not DB schema)
  const jwksRequest = new Request(`${env.BETTER_AUTH_URL}/api/auth/jwks`)
  const jwksResponse = await auth.handler(jwksRequest)
  if (!jwksResponse.ok) {
    throw new Error(`Failed to get JWKS: ${jwksResponse.status}`)
  }
  const jwks = (await jwksResponse.json()) as { keys: JsonWebKey[] }
  const JWKS = createLocalJWKSet(jwks)

  const { payload: claims } = await jwtVerify(payload.authToken, JWKS, {
    issuer: env.BETTER_AUTH_URL,
    audience: env.BETTER_AUTH_URL,
  })

  if (!claims.sub) {
    throw new Error('Invalid token: missing subject')
  }

  // Validate org access - storeId must match JWT's orgId
  if (claims.orgId !== context.storeId) {
    throw new Error('Access denied: not a member of this organization')
  }
}

export default {
  async fetch(request: CfTypes.Request, env: Env, ctx: CfTypes.ExecutionContext) {
    const url = new URL(request.url)

    // Custom /api/auth/me endpoint - returns current user with org info
    if (url.pathname === '/api/auth/me') {
      const db = createDb(env.DB)
      const auth = createAuth(env, db)

      const session = await auth.api.getSession({
        headers: request.headers as unknown as Headers,
      })

      if (!session) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Fetch organization if activeOrganizationId is set
      let organization = null
      if (session.session.activeOrganizationId) {
        const org = await auth.api.getFullOrganization({
          headers: request.headers as unknown as Headers,
          query: { organizationId: session.session.activeOrganizationId },
        })
        if (org) {
          organization = { id: org.id, name: org.name, slug: org.slug }
        }
      }

      return new Response(
        JSON.stringify({
          user: {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
          },
          session: {
            activeOrganizationId: session.session.activeOrganizationId,
          },
          organization,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    // Custom /api/org/:id endpoint - returns org if user is a member
    if (url.pathname.startsWith('/api/org/')) {
      const orgId = url.pathname.replace('/api/org/', '')
      if (!orgId) {
        return new Response(JSON.stringify({ error: 'Missing org ID' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const db = createDb(env.DB)
      const auth = createAuth(env, db)

      const session = await auth.api.getSession({
        headers: request.headers as unknown as Headers,
      })

      if (!session) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Check if user is a member of this organization
      let org
      try {
        org = await auth.api.getFullOrganization({
          headers: request.headers as unknown as Headers,
          query: { organizationId: orgId },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (message.includes('not found') || message.includes('Organization not found')) {
          return new Response(JSON.stringify({ error: 'Organization not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (message.includes('not a member')) {
          return new Response(JSON.stringify({ error: 'Access denied' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        throw error
      }

      if (!org) {
        return new Response(JSON.stringify({ error: 'Organization not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Check membership
      const member = org.members.find((m) => m.userId === session.user.id)
      if (!member) {
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(
        JSON.stringify({
          id: org.id,
          name: org.name,
          slug: org.slug,
          role: member.role,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    // Handle auth routes (Better Auth catch-all)
    if (url.pathname.startsWith('/api/auth')) {
      const db = createDb(env.DB)
      const auth = createAuth(env, db)
      return auth.handler(request as unknown as Request)
    }

    if (url.pathname === '/api/metadata') {
      return Effect.runPromise(metadataRequestToResponse(request as unknown as Request))
    }

    // Route to initialize the link processor
    if (url.pathname === '/api/link-processor') {
      const storeId = url.searchParams.get('storeId')
      if (!storeId) {
        return new Response('Missing storeId parameter', { status: 400 })
      }

      const processorId = env.LINK_PROCESSOR_DO.idFromName(storeId)
      const processor = env.LINK_PROCESSOR_DO.get(processorId)

      return processor.fetch(request as unknown as Request)
    }

    const searchParams = SyncBackend.matchSyncRequest(request)

    if (searchParams !== undefined) {
      return SyncBackend.handleSyncRequest({
        request,
        searchParams,
        ctx,
        syncBackendBinding: 'SYNC_BACKEND_DO',
        syncPayloadSchema: SyncPayload,
        validatePayload: (payload, context) => {
          const db = createDb(env.DB)
          const auth = createAuth(env, db)
          return validatePayload(payload, context, env, auth)
        },
      })
    }

    return new Response('Not found', { status: 404 })
  },
}
