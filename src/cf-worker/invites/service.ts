import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { Effect } from "effect";

import { INVITE_CODE_CHARS, INVITE_CODE_LENGTH } from "@/lib/invite";

import { createAuth, type Auth } from "../auth";
import { createDb } from "../db";
import * as schema from "../db/schema";
import { logSync } from "../logger";
import { type Env } from "../shared";
import {
  ForbiddenError,
  InvalidInviteError,
  InviteNotFoundError,
  UnauthorizedError,
} from "./errors";

const logger = logSync("Invites");

function generateInviteCode(): string {
  const array = new Uint8Array(INVITE_CODE_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(
    array,
    (byte) => INVITE_CODE_CHARS[byte % INVITE_CODE_CHARS.length]
  ).join("");
}

function generateInviteId(): string {
  return crypto.randomUUID();
}

const getSession = (auth: Auth, headers: Headers) =>
  Effect.tryPromise({
    catch: () => new UnauthorizedError(),
    try: () => auth.api.getSession({ headers }),
  }).pipe(
    Effect.flatMap((session) =>
      session ? Effect.succeed(session) : Effect.fail(new UnauthorizedError())
    )
  );

const requireAdmin = (session: { user: { role?: string | null } }) =>
  session.user.role === "admin"
    ? Effect.void
    : Effect.fail(new ForbiddenError());

const handleCreateInviteRequest = (request: Request, env: Env) =>
  Effect.gen(function* handleCreateInviteRequest() {
    const db = createDb(env.DB);
    const auth = createAuth(env, db);
    const session = yield* getSession(auth, request.headers);
    yield* requireAdmin(session);

    const expiresInDays = yield* Effect.promise(async () => {
      try {
        const body = (await request.json()) as { expiresInDays?: number };
        return body.expiresInDays;
      } catch {
        return;
      }
    });

    const code = generateInviteCode();
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    yield* Effect.promise(() =>
      db.insert(schema.invite).values({
        code,
        createdByUserId: session.user.id,
        expiresAt,
        id: generateInviteId(),
      })
    );

    logger.info("Invite created", { hasExpiry: !!expiresAt });
    return { code, expiresAt };
  });

export const handleCreateInvite = (
  request: Request,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    handleCreateInviteRequest(request, env).pipe(
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        ForbiddenError: () =>
          Effect.succeed(
            Response.json({ error: "Admin access required" }, { status: 403 })
          ),
        UnauthorizedError: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
      })
    )
  );

const handleListInvitesRequest = (request: Request, env: Env) =>
  Effect.gen(function* handleListInvitesRequest() {
    const db = createDb(env.DB);
    const auth = createAuth(env, db);
    const session = yield* getSession(auth, request.headers);
    yield* requireAdmin(session);

    const invites = yield* Effect.promise(() =>
      db.query.invite.findMany({
        orderBy: [desc(schema.invite.createdAt)],
        with: {
          createdBy: { columns: { email: true, id: true, name: true } },
          usedBy: { columns: { email: true, id: true, name: true } },
        },
      })
    );

    logger.debug("List invites", { count: invites.length });
    return { invites };
  });

export const handleListInvites = (
  request: Request,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    handleListInvitesRequest(request, env).pipe(
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        ForbiddenError: () =>
          Effect.succeed(
            Response.json({ error: "Admin access required" }, { status: 403 })
          ),
        UnauthorizedError: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
      })
    )
  );

// DELETE /api/invites/:id - Delete invite (admin only)
const handleDeleteInviteRequest = (
  request: Request,
  inviteId: string,
  env: Env
) =>
  Effect.gen(function* handleDeleteInviteRequest() {
    const db = createDb(env.DB);
    const auth = createAuth(env, db);
    const session = yield* getSession(auth, request.headers);
    yield* requireAdmin(session);

    const invite = yield* Effect.promise(() =>
      db.query.invite.findFirst({
        where: eq(schema.invite.id, inviteId),
      })
    );

    if (!invite) {
      logger.info("Delete invite not found");
      return yield* Effect.fail(new InviteNotFoundError());
    }

    yield* Effect.promise(() =>
      db.delete(schema.invite).where(eq(schema.invite.id, inviteId))
    );

    logger.info("Invite deleted");
    return { success: true };
  });

export const handleDeleteInvite = (
  request: Request,
  inviteId: string,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    handleDeleteInviteRequest(request, inviteId, env).pipe(
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        ForbiddenError: () =>
          Effect.succeed(
            Response.json({ error: "Admin access required" }, { status: 403 })
          ),
        InviteNotFoundError: () =>
          Effect.succeed(
            Response.json({ error: "Invite not found" }, { status: 404 })
          ),
        UnauthorizedError: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
      })
    )
  );

const handleRedeemInviteRequest = (request: Request, env: Env) =>
  Effect.gen(function* handleRedeemInviteRequest() {
    const db = createDb(env.DB);
    const auth = createAuth(env, db);
    const session = yield* getSession(auth, request.headers);

    const user = session.user as typeof session.user & { approved?: boolean };
    if (user.approved) {
      logger.debug("Redeem invite - already approved");
      return { success: true };
    }

    const body = yield* Effect.tryPromise({
      catch: () => new InvalidInviteError(),
      try: () => request.json() as Promise<{ code?: string }>,
    });

    if (!body.code) {
      logger.info("Redeem invite - missing code");
      return yield* Effect.fail(new InvalidInviteError());
    }

    const invite = yield* Effect.promise(() =>
      db.query.invite.findFirst({
        where: and(
          eq(schema.invite.code, body.code!.toUpperCase()),
          isNull(schema.invite.usedByUserId),
          or(
            isNull(schema.invite.expiresAt),
            gt(schema.invite.expiresAt, new Date())
          )
        ),
      })
    );

    if (!invite) {
      logger.info("Redeem invite - invalid or expired code");
      return yield* Effect.fail(new InvalidInviteError());
    }

    yield* Effect.promise(() =>
      db.batch([
        db
          .update(schema.invite)
          .set({ usedAt: new Date(), usedByUserId: session.user.id })
          .where(eq(schema.invite.id, invite.id)),
        db
          .update(schema.user)
          .set({ approved: true })
          .where(eq(schema.user.id, session.user.id)),
      ])
    );

    return { success: true };
  });

export const handleRedeemInvite = (
  request: Request,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    handleRedeemInviteRequest(request, env).pipe(
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        InvalidInviteError: () =>
          Effect.succeed(
            Response.json(
              { error: "Invalid or expired invite code" },
              { status: 400 }
            )
          ),
        UnauthorizedError: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
      })
    )
  );
