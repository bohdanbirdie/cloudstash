import type { CfTypes } from '@livestore/sync-cf/cf-worker'
import * as SyncBackend from '@livestore/sync-cf/cf-worker'
import { jwtVerify, createLocalJWKSet } from 'jose'

import { SyncPayload } from '../../livestore/schema'
import { createAuth, type Auth } from '../auth'
import { createDb } from '../db'
import type { Env } from '../shared'

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

type SyncSearchParams = NonNullable<ReturnType<typeof SyncBackend.matchSyncRequest>>

export const handleSyncRequest = (
  request: CfTypes.Request,
  searchParams: SyncSearchParams,
  ctx: CfTypes.ExecutionContext,
  env: Env,
) => {
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

export { SyncBackend }
