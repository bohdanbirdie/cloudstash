import { Effect, Data } from 'effect'
import type { Auth } from './index'

export type SyncAuthErrorCode = 'SESSION_EXPIRED' | 'ACCESS_DENIED' | 'UNAPPROVED'

export class SyncAuthError extends Data.TaggedError('SyncAuthError')<{
  status: number
  code: SyncAuthErrorCode
  message: string
}> {}

/**
 * Pre-flight auth check for sync connections.
 * Currently assumes storeId === activeOrganizationId.
 * Extend this when adding non-org store types.
 */
export const checkSyncAuth = (
  cookie: string | null,
  storeId: string,
  auth: Auth,
): Effect.Effect<void, SyncAuthError> =>
  Effect.gen(function* () {
    if (!cookie) {
      return yield* new SyncAuthError({
        status: 401,
        code: 'SESSION_EXPIRED',
        message: 'No session cookie',
      })
    }

    const session = yield* Effect.tryPromise({
      try: () => auth.api.getSession({ headers: new Headers({ cookie }) }),
      catch: () =>
        new SyncAuthError({
          status: 401,
          code: 'SESSION_EXPIRED',
          message: 'Failed to validate session',
        }),
    })

    if (!session?.session) {
      return yield* new SyncAuthError({
        status: 401,
        code: 'SESSION_EXPIRED',
        message: 'Session expired or invalid',
      })
    }

    const user = session.user as typeof session.user & { approved?: boolean }
    if (!user.approved) {
      return yield* new SyncAuthError({
        status: 403,
        code: 'UNAPPROVED',
        message: 'Account pending approval',
      })
    }

    if (session.session.activeOrganizationId !== storeId) {
      return yield* new SyncAuthError({
        status: 403,
        code: 'ACCESS_DENIED',
        message: 'You do not have access to this workspace',
      })
    }
  })
