import { Effect, Layer } from "effect";

import { INVITE_CODE_CHARS, INVITE_CODE_LENGTH } from "@/lib/invite";

import type { Auth } from "../auth";
import { AppLayerLive, AuthClient } from "../auth/service";
import type { InviteId } from "../db/branded";
import {
  InviteId as InviteIdBrand,
  UserId as UserIdBrand,
} from "../db/branded";
import { sendApprovalEmail } from "../email/send-approval-email";
import type { Env } from "../shared";
import {
  InvitesForbiddenError,
  InvalidInviteError,
  InviteNotFoundError,
  InvitesUnauthorizedError,
} from "./errors";
import { InviteStore, InviteStoreLive } from "./store";

function generateInviteCode(): string {
  const array = new Uint8Array(INVITE_CODE_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(
    array,
    (byte) => INVITE_CODE_CHARS[byte % INVITE_CODE_CHARS.length]
  ).join("");
}

function generateInviteId(): InviteId {
  return InviteIdBrand.make(crypto.randomUUID());
}

const getSession = (auth: Auth, headers: Headers) =>
  Effect.tryPromise({
    catch: () => new InvitesUnauthorizedError(),
    try: () => auth.api.getSession({ headers }),
  }).pipe(
    Effect.flatMap((session) =>
      session
        ? Effect.succeed(session)
        : Effect.fail(new InvitesUnauthorizedError())
    )
  );

const requireAdmin = (session: { user: { role?: string | null } }) =>
  session.user.role === "admin"
    ? Effect.void
    : Effect.fail(new InvitesForbiddenError());

const handleCreateInviteRequest = Effect.fn(
  "Invites.handleCreateInviteRequest"
)(function* (request: Request) {
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
    createdByUserId: UserIdBrand.make(session.user.id),
    expiresAt,
    id: generateInviteId(),
  });

  yield* Effect.logInfo("Invite created").pipe(
    Effect.annotateLogs({ hasExpiry: !!expiresAt })
  );
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
        InvitesForbiddenError: () =>
          Effect.succeed(
            Response.json({ error: "Admin access required" }, { status: 403 })
          ),
        InvitesUnauthorizedError: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
      })
    )
  );

const handleListInvitesRequest = Effect.fn("Invites.handleListInvitesRequest")(
  function* (request: Request) {
    const auth = yield* AuthClient;
    const inviteStore = yield* InviteStore;
    const session = yield* getSession(auth, request.headers);
    yield* requireAdmin(session);

    const invites = yield* inviteStore.list();

    yield* Effect.logDebug("List invites").pipe(
      Effect.annotateLogs({ count: invites.length })
    );
    return { invites };
  }
);

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
        InvitesForbiddenError: () =>
          Effect.succeed(
            Response.json({ error: "Admin access required" }, { status: 403 })
          ),
        InvitesUnauthorizedError: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
      })
    )
  );

const handleDeleteInviteRequest = Effect.fn(
  "Invites.handleDeleteInviteRequest"
)(function* (request: Request, inviteId: InviteId) {
  const auth = yield* AuthClient;
  const inviteStore = yield* InviteStore;
  const session = yield* getSession(auth, request.headers);
  yield* requireAdmin(session);

  const invite = yield* inviteStore.findById(inviteId);

  if (!invite) {
    yield* Effect.logInfo("Delete invite not found");
    return yield* new InviteNotFoundError({ inviteId });
  }

  yield* inviteStore.deleteById(inviteId);

  yield* Effect.logInfo("Invite deleted");
  return { success: true };
});

export const handleDeleteInvite = (
  request: Request,
  inviteId: InviteId,
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
        InvitesForbiddenError: () =>
          Effect.succeed(
            Response.json({ error: "Admin access required" }, { status: 403 })
          ),
        InviteNotFoundError: () =>
          Effect.succeed(
            Response.json({ error: "Invite not found" }, { status: 404 })
          ),
        InvitesUnauthorizedError: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
      })
    )
  );

const handleRedeemInviteRequest = Effect.fn(
  "Invites.handleRedeemInviteRequest"
)(function* (request: Request, env: Env) {
  const auth = yield* AuthClient;
  const inviteStore = yield* InviteStore;
  const session = yield* getSession(auth, request.headers);

  if (session.user.approved) {
    yield* Effect.logDebug("Redeem invite - already approved");
    return { success: true };
  }

  const body = yield* Effect.tryPromise({
    catch: () => new InvalidInviteError(),
    try: (): Promise<{ code?: string }> => request.json(),
  });

  if (!body.code) {
    yield* Effect.logInfo("Redeem invite - missing code");
    return yield* new InvalidInviteError();
  }

  const invite = yield* inviteStore.findValidByCode(body.code);

  if (!invite) {
    yield* Effect.logInfo("Redeem invite - invalid or expired code");
    return yield* new InvalidInviteError();
  }

  yield* inviteStore.redeemAndApproveUser(
    InviteIdBrand.make(invite.id),
    UserIdBrand.make(session.user.id)
  );

  yield* sendApprovalEmail(
    session.user.email,
    session.user.name,
    env.RESEND_API_KEY,
    env.EMAIL_FROM
  );

  yield* Effect.logInfo("Invite redeemed").pipe(
    Effect.annotateLogs({ inviteId: invite.id })
  );
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
        InvitesUnauthorizedError: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
      })
    )
  );
