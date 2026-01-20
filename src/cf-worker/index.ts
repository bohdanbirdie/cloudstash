/// <reference types="@cloudflare/workers-types" />
import '@livestore/adapter-cloudflare/polyfill'
import { Effect } from 'effect'
import type { CfTypes } from '@livestore/sync-cf/cf-worker'
import * as SyncBackend from '@livestore/sync-cf/cf-worker'
import { jwtVerify, createLocalJWKSet } from 'jose'

import { SyncPayload } from '../livestore/schema'
import { createAuth } from './auth'
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
) => {
  if (!payload?.authToken) {
    throw new Error('Missing auth token')
  }

  // Fetch JWKS manually (createRemoteJWKSet has issues with self-referential fetch in Workers)
  const jwksResponse = await fetch(`${env.BETTER_AUTH_URL}/api/auth/jwks`)
  if (!jwksResponse.ok) {
    throw new Error(`Failed to fetch JWKS: ${jwksResponse.status}`)
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

  // TODO: Add proper resource access validation (e.g., check if user has access to requested storeId)
  // Currently relies on client requesting correct storeId (user-{userId})
  // See docs/auth.md "Future: Multi-Store Access" for options
}

export default {
  async fetch(request: CfTypes.Request, env: Env, ctx: CfTypes.ExecutionContext) {
    const url = new URL(request.url)

    // Handle auth routes
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
        validatePayload: (payload, context) => validatePayload(payload, context, env),
      })
    }

    return new Response('Not found', { status: 404 })
  },
}
