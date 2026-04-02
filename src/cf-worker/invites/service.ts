import { Effect, Layer } from "effect";

import { INVITE_CODE_CHARS, INVITE_CODE_LENGTH } from "@/lib/invite";

import type { Auth } from "../auth";
import { AppLayerLive, AuthClient } from "../auth/service";
import { sendApprovalEmail } from "../email/send-approval-email";
import { logSync } from "../logger";
import type { Env } from "../shared";
import {
  ForbiddenError,
  InvalidInviteError,
  InviteNotFoundError,
  UnauthorizedError,
} from "./errors";
import { InviteStore, InviteStoreLive } from "./store";

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

const handleCreateInviteRequest = Effect.fn("Invites.handleCreateInviteRequest")(function* (request: Request) {
    const auth = yield* AuthClient;
    const inviteStore = yield* InviteStore;
    const session = yield* getSession(auth, request.headers);
    yield* requireAdmin(session);

    const expiresInDays = yield* Effect.tryPromise({
      catch: () => undefined,
      try: (): Promise<{ expiresInDays?: number }> => request.json(),
    }).pipe(
      Effect.map((body) => body.expiresInDays),
      Effect.catchAll(() => Effect.void)
    );

    const code = generateInviteCode();
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    yield* inviteStore.create({
      code,
      createdByUserId: session.user.id,
      expiresAt,
      id: generateInviteId(),
    });

    logger.info("Invite created", { hasExpiry: !!expiresAt });
    return { code, expiresAt };
  });

export const handleCreateInvite = (
  request: Request,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    handleCreateInviteRequest(request).pipe(
      Effect.provide(Layer.provideMerge(InviteStoreLive, AppLayerLive(env))),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        DbError: () =>
          Effect.succeed(
            Response.json({ error: "Internal server error" }, { status: 500 })
          ),
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

const handleListInvitesRequest = Effect.fn("Invites.handleListInvitesRequest")(function* (request: Request) {
    const auth = yield* AuthClient;
    const inviteStore = yield* InviteStore;
    const session = yield* getSession(auth, request.headers);
    yield* requireAdmin(session);

    const invites = yield* inviteStore.list();

    logger.debug("List invites", { count: invites.length });
    return { invites };
  });

export const handleListInvites = (
  request: Request,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    handleListInvitesRequest(request).pipe(
      Effect.provide(Layer.provideMerge(InviteStoreLive, AppLayerLive(env))),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        DbError: () =>
          Effect.succeed(
            Response.json({ error: "Internal server error" }, { status: 500 })
          ),
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

const handleDeleteInviteRequest = Effect.fn("Invites.handleDeleteInviteRequest")(function* (request: Request, inviteId: string) {
    const auth = yield* AuthClient;
    const inviteStore = yield* InviteStore;
    const session = yield* getSession(auth, request.headers);
    yield* requireAdmin(session);

    const invite = yield* inviteStore.findById(inviteId);

    if (!invite) {
      logger.info("Delete invite not found");
      return yield* new InviteNotFoundError();
    }

    yield* inviteStore.deleteById(inviteId);

    logger.info("Invite deleted");
    return { success: true };
  });

export const handleDeleteInvite = (
  request: Request,
  inviteId: string,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    handleDeleteInviteRequest(request, inviteId).pipe(
      Effect.provide(Layer.provideMerge(InviteStoreLive, AppLayerLive(env))),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        DbError: () =>
          Effect.succeed(
            Response.json({ error: "Internal server error" }, { status: 500 })
          ),
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

const handleRedeemInviteRequest = Effect.fn("Invites.handleRedeemInviteRequest")(function* (request: Request, env: Env) {
    const auth = yield* AuthClient;
    const inviteStore = yield* InviteStore;
    const session = yield* getSession(auth, request.headers);

    if (session.user.approved) {
      logger.debug("Redeem invite - already approved");
      return { success: true };
    }

    const body = yield* Effect.tryPromise({
      catch: () => new InvalidInviteError(),
      try: (): Promise<{ code?: string }> => request.json(),
    });

    if (!body.code) {
      logger.info("Redeem invite - missing code");
      return yield* new InvalidInviteError();
    }

    const invite = yield* inviteStore.findValidByCode(body.code);

    if (!invite) {
      logger.info("Redeem invite - invalid or expired code");
      return yield* new InvalidInviteError();
    }

    yield* inviteStore.redeemAndApproveUser(invite.id, session.user.id);

    yield* sendApprovalEmail(
      session.user.email,
      session.user.name,
      env.RESEND_API_KEY,
      env.EMAIL_FROM
    );

    logger.info("Invite redeemed", { inviteId: invite.id });
    return { success: true };
  });

export const handleRedeemInvite = (
  request: Request,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    handleRedeemInviteRequest(request, env).pipe(
      Effect.provide(Layer.provideMerge(InviteStoreLive, AppLayerLive(env))),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        DbError: () =>
          Effect.succeed(
            Response.json({ error: "Internal server error" }, { status: 500 })
          ),
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
