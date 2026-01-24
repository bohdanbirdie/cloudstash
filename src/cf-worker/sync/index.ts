import type { CfTypes } from '@livestore/sync-cf/cf-worker'
import * as SyncBackend from '@livestore/sync-cf/cf-worker'
import { Effect } from 'effect'

import { createAuth, type Auth } from '../auth'
import { createDb } from '../db'
import { logSync } from '../logger'
import type { Env } from '../shared'
import { InvalidSessionError, MissingSessionCookieError, OrgAccessDeniedError } from './errors'

const logger = logSync('SyncBackend')

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
    logger.info('Waking up processor', { storeId })
    const processorId = this._env.LINK_PROCESSOR_DO.idFromName(storeId)
    const processor = this._env.LINK_PROCESSOR_DO.get(processorId)
    processor
      .fetch(`https://link-processor/?storeId=${storeId}`)
      .then(() => logger.info('Processor fetch succeeded', { storeId }))
      .catch((error: unknown) =>
        logger.error('Processor fetch failed', { storeId, error: String(error) }),
      )
  }
}

const validatePayload = (
  _payload: unknown,
  context: { storeId: string; headers: ReadonlyMap<string, string> },
  auth: Auth,
) =>
  Effect.gen(function* () {
    const cookie = context.headers.get('cookie')
    if (!cookie) {
      return yield* new MissingSessionCookieError()
    }

    const session = yield* Effect.tryPromise({
      try: () => auth.api.getSession({ headers: new Headers({ cookie }) }),
      catch: () => new InvalidSessionError(),
    })

    if (!session?.session) {
      return yield* new InvalidSessionError()
    }

    if (session.session.activeOrganizationId !== context.storeId) {
      return yield* new OrgAccessDeniedError({
        storeId: context.storeId,
        sessionOrgId: session.session.activeOrganizationId ?? null,
      })
    }
  }).pipe(Effect.runPromise)

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
    validatePayload: (payload, context) => {
      const db = createDb(env.DB)
      const auth = createAuth(env, db)
      return validatePayload(payload, context, auth)
    },
  })
}

export { SyncBackend }
