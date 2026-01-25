import { Effect } from 'effect'
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm'

import { createAuth, type Auth } from '../auth'
import { createDb } from '../db'
import * as schema from '../db/schema'
import type { Env } from '../shared'
import { ForbiddenError, InvalidInviteError, InviteNotFoundError, UnauthorizedError } from './errors'

// Character set excluding ambiguous characters (0, O, I, L)
const INVITE_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const INVITE_CODE_LENGTH = 8

function generateInviteCode(): string {
  const array = new Uint8Array(INVITE_CODE_LENGTH)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => INVITE_CODE_CHARS[byte % INVITE_CODE_CHARS.length]).join('')
}

function generateInviteId(): string {
  return crypto.randomUUID()
}

const getSession = (auth: Auth, headers: Headers) =>
  Effect.tryPromise({
    try: () => auth.api.getSession({ headers }),
    catch: () => new UnauthorizedError(),
  }).pipe(
    Effect.flatMap((session) =>
      session ? Effect.succeed(session) : Effect.fail(new UnauthorizedError()),
    ),
  )

const requireAdmin = (session: { user: { role?: string | null } }) =>
  session.user.role === 'admin' ? Effect.void : Effect.fail(new ForbiddenError())

const handleCreateInviteRequest = (request: Request, env: Env) =>
  Effect.gen(function* () {
    const db = createDb(env.DB)
    const auth = createAuth(env, db)
    const session = yield* getSession(auth, request.headers)
    yield* requireAdmin(session)

    const expiresInDays = yield* Effect.promise(async () => {
      try {
        const body = (await request.json()) as { expiresInDays?: number }
        return body.expiresInDays
      } catch {
        return undefined
      }
    })

    const code = generateInviteCode()
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null

    yield* Effect.promise(() =>
      db.insert(schema.invite).values({
        id: generateInviteId(),
        code,
        createdByUserId: session.user.id,
        expiresAt,
      }),
    )

    return { code, expiresAt }
  })

export const handleCreateInvite = (request: Request, env: Env): Promise<Response> =>
  Effect.runPromise(
    handleCreateInviteRequest(request, env).pipe(
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        UnauthorizedError: () =>
          Effect.succeed(Response.json({ error: 'Unauthorized' }, { status: 401 })),
        ForbiddenError: () =>
          Effect.succeed(Response.json({ error: 'Admin access required' }, { status: 403 })),
      }),
    ),
  )

const handleListInvitesRequest = (request: Request, env: Env) =>
  Effect.gen(function* () {
    const db = createDb(env.DB)
    const auth = createAuth(env, db)
    const session = yield* getSession(auth, request.headers)
    yield* requireAdmin(session)

    const invites = yield* Effect.promise(() =>
      db.query.invite.findMany({
        with: {
          createdBy: { columns: { id: true, name: true, email: true } },
          usedBy: { columns: { id: true, name: true, email: true } },
        },
        orderBy: [desc(schema.invite.createdAt)],
      }),
    )

    return { invites }
  })

export const handleListInvites = (request: Request, env: Env): Promise<Response> =>
  Effect.runPromise(
    handleListInvitesRequest(request, env).pipe(
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        UnauthorizedError: () =>
          Effect.succeed(Response.json({ error: 'Unauthorized' }, { status: 401 })),
        ForbiddenError: () =>
          Effect.succeed(Response.json({ error: 'Admin access required' }, { status: 403 })),
      }),
    ),
  )

// DELETE /api/invites/:id - Delete invite (admin only)
const handleDeleteInviteRequest = (request: Request, inviteId: string, env: Env) =>
  Effect.gen(function* () {
    const db = createDb(env.DB)
    const auth = createAuth(env, db)
    const session = yield* getSession(auth, request.headers)
    yield* requireAdmin(session)

    const invite = yield* Effect.promise(() =>
      db.query.invite.findFirst({
        where: eq(schema.invite.id, inviteId),
      }),
    )

    if (!invite) {
      return yield* Effect.fail(new InviteNotFoundError())
    }

    yield* Effect.promise(() => db.delete(schema.invite).where(eq(schema.invite.id, inviteId)))

    return { success: true }
  })

export const handleDeleteInvite = (
  request: Request,
  inviteId: string,
  env: Env,
): Promise<Response> =>
  Effect.runPromise(
    handleDeleteInviteRequest(request, inviteId, env).pipe(
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        UnauthorizedError: () =>
          Effect.succeed(Response.json({ error: 'Unauthorized' }, { status: 401 })),
        ForbiddenError: () =>
          Effect.succeed(Response.json({ error: 'Admin access required' }, { status: 403 })),
        InviteNotFoundError: () =>
          Effect.succeed(Response.json({ error: 'Invite not found' }, { status: 404 })),
      }),
    ),
  )

const handleRedeemInviteRequest = (request: Request, env: Env) =>
  Effect.gen(function* () {
    const db = createDb(env.DB)
    const auth = createAuth(env, db)
    const session = yield* getSession(auth, request.headers)

    const user = session.user as typeof session.user & { approved?: boolean }
    if (user.approved) {
      return { success: true }
    }

    const body = yield* Effect.tryPromise({
      try: () => request.json() as Promise<{ code?: string }>,
      catch: () => new InvalidInviteError(),
    })

    if (!body.code) {
      return yield* Effect.fail(new InvalidInviteError())
    }

    const invite = yield* Effect.promise(() =>
      db.query.invite.findFirst({
        where: and(
          eq(schema.invite.code, body.code!.toUpperCase()),
          isNull(schema.invite.usedByUserId),
          or(isNull(schema.invite.expiresAt), gt(schema.invite.expiresAt, new Date())),
        ),
      }),
    )

    if (!invite) {
      return yield* Effect.fail(new InvalidInviteError())
    }

    yield* Effect.promise(() =>
      db.batch([
        db
          .update(schema.invite)
          .set({ usedByUserId: session.user.id, usedAt: new Date() })
          .where(eq(schema.invite.id, invite.id)),
        db
          .update(schema.user)
          .set({ approved: true })
          .where(eq(schema.user.id, session.user.id)),
      ]),
    )

    return { success: true }
  })

export const handleRedeemInvite = (request: Request, env: Env): Promise<Response> =>
  Effect.runPromise(
    handleRedeemInviteRequest(request, env).pipe(
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        UnauthorizedError: () =>
          Effect.succeed(Response.json({ error: 'Unauthorized' }, { status: 401 })),
        InvalidInviteError: () =>
          Effect.succeed(
            Response.json({ error: 'Invalid or expired invite code' }, { status: 400 }),
          ),
      }),
    ),
  )
