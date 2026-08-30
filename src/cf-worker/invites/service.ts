import { Effect, Layer, Schema } from "effect";

import { INVITE_CODE_CHARS, INVITE_CODE_LENGTH } from "@/lib/invite";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

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
  InvalidInviteRequestError,
  InviteNotFoundError,
  InvitesUnauthorizedError,
} from "./errors";
import { InviteStore, InviteStoreLive } from "./store";

export const MAX_EXPIRES_IN_DAYS = 365;

export const CreateInviteBody = Schema.Struct({
  expiresInDays: Schema.optional(
    Schema.Number.check(
      Schema.isInt(),
      Schema.isGreaterThan(0),
      Schema.isLessThanOrEqualTo(MAX_EXPIRES_IN_DAYS)
    )
  ),
});

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

type Session = Effect.Success<ReturnType<typeof getSession>>;

const requireMemberManagement = (session: Session) =>
  hasPermission(session.user.role, PERMISSIONS.manageMembers)
    ? Effect.void
    : Effect.fail(new InvitesForbiddenError());

const jsonError = (error: string, status: number) =>
  Effect.succeed(Response.json({ error }, { status }));

const commonErrors = {
  DbError: () => jsonError("Internal server error", 500),
  InvitesUnauthorizedError: () => jsonError("Unauthorized", 401),
};

const adminErrors = {
  ...commonErrors,
  InvitesForbiddenError: () => jsonError("Admin access required", 403),
};

const invitesLayer = (env: Env) =>
  Layer.provideMerge(InviteStoreLive, AppLayerLive(env));

const handleCreateInviteRequest = Effect.fn(
  "Invites.handleCreateInviteRequest"
)(function* (request: Request) {
  const auth = yield* AuthClient;
  const inviteStore = yield* InviteStore;
  const session = yield* getSession(auth, request.headers);
  yield* requireMemberManagement(session);

  const rawBody = yield* Effect.tryPromise((): Promise<unknown> =>
    request.json()
  ).pipe(Effect.orElseSucceed(() => ({})));

  const decoded = yield* Schema.decodeUnknownEffect(CreateInviteBody)(
    rawBody
  ).pipe(
    Effect.mapError(
      (error) =>
        new InvalidInviteRequestError({
          reason: error.message,
        })
    ),
    Effect.tapError((error) =>
      Effect.logInfo("Invite create rejected").pipe(
        Effect.annotateLogs({ reason: error.reason })
      )
    )
  );

  const code = generateInviteCode();
  const expiresAt = decoded.expiresInDays
    ? new Date(Date.now() + decoded.expiresInDays * 24 * 60 * 60 * 1000)
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
      Effect.provide(invitesLayer(env)),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        ...adminErrors,
        InvalidInviteRequestError: (error) => jsonError(error.reason, 400),
      })
    )
  );

const handleListInvitesRequest = Effect.fn("Invites.handleListInvitesRequest")(
  function* (request: Request) {
    const auth = yield* AuthClient;
    const inviteStore = yield* InviteStore;
    const session = yield* getSession(auth, request.headers);
    yield* requireMemberManagement(session);

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
      Effect.provide(invitesLayer(env)),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags(adminErrors)
    )
  );

const handleDeleteInviteRequest = Effect.fn(
  "Invites.handleDeleteInviteRequest"
)(function* (request: Request, inviteId: InviteId) {
  const auth = yield* AuthClient;
  const inviteStore = yield* InviteStore;
  const session = yield* getSession(auth, request.headers);
  yield* requireMemberManagement(session);

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
      Effect.provide(invitesLayer(env)),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        ...adminErrors,
        InviteNotFoundError: () => jsonError("Invite not found", 404),
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

  const claimed = yield* inviteStore.redeemAndApproveUser(
    InviteIdBrand.make(invite.id),
    UserIdBrand.make(session.user.id)
  );
  if (!claimed) {
    yield* Effect.logInfo("Redeem invite - race lost (already claimed)");
    return yield* new InvalidInviteError();
  }

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
      Effect.provide(invitesLayer(env)),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        ...commonErrors,
        InvalidInviteError: () =>
          jsonError("Invalid or expired invite code", 400),
      })
    )
  );
