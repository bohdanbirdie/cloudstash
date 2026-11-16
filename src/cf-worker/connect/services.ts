import { Context, Effect, Option, Schema } from "effect";

import { matchWorkspaceAccessError } from "../auth/workspace-access";
import type { WorkspaceAccess } from "../auth/workspace-access";
import { ApiKey, ApiKeyRowId, OrgId, UserId } from "../db/branded";
import type { DbError } from "../db/service";
import { maskId } from "../log-utils";
import { ConnectUnauthorizedError, SessionLookupError } from "./errors";
import type { KeyCreationError } from "./errors";

export class InvalidVerificationPayloadError extends Schema.TaggedError<InvalidVerificationPayloadError>()(
  "InvalidVerificationPayloadError",
  {
    identifier: Schema.String,
  }
) {}

export const ApiKeyInfo = Schema.Struct({
  id: ApiKeyRowId,
  metadata: Schema.NullOr(Schema.String),
});
export type ApiKeyInfo = typeof ApiKeyInfo.Type;

export const VerificationData = Schema.Struct({
  key: ApiKey,
  keyId: ApiKeyRowId,
  orgId: Schema.optional(OrgId),
});
export type VerificationData = typeof VerificationData.Type;

export const VerificationRecord = Schema.Struct({
  id: Schema.String,
  data: VerificationData,
});
export type VerificationRecord = typeof VerificationRecord.Type;

export const SessionData = Schema.Struct({
  userId: UserId,
  orgId: Schema.NullOr(OrgId),
});
export type SessionData = typeof SessionData.Type;

export const connectWorkspaceAccessError = (
  error: Parameters<typeof matchWorkspaceAccessError>[0]
): ConnectUnauthorizedError | SessionLookupError =>
  matchWorkspaceAccessError<ConnectUnauthorizedError | SessionLookupError>(
    error,
    {
      unauthorized: () => new ConnectUnauthorizedError(),
      missingScope: () => new ConnectUnauthorizedError(),
      forbidden: () => new ConnectUnauthorizedError(),
      backend: ({ cause }) => new SessionLookupError({ cause }),
    }
  );

export const getAuthorizedSession = Effect.fnUntraced(function* (
  workspaceAccess: WorkspaceAccess["Service"],
  headers: Headers
) {
  return yield* workspaceAccess.authorizeSession(headers).pipe(
    Effect.map(({ orgId, userId }) => ({ orgId, userId })),
    Effect.catch((error) =>
      Option.match(
        matchWorkspaceAccessError<Option.Option<SessionLookupError>>(error, {
          unauthorized: () => Option.none(),
          missingScope: () => Option.none(),
          forbidden: () => Option.none(),
          backend: ({ cause }) =>
            Option.some(new SessionLookupError({ cause })),
        }),
        {
          onNone: () => Effect.succeed(null),
          onSome: Effect.fail,
        }
      )
    )
  );
});

export class SessionProvider extends Context.Service<
  SessionProvider,
  {
    // Returns null when there's no session; fails with SessionLookupError when
    // the auth backend itself is unreachable. Callers can map the two to
    // 401 vs 5xx.
    readonly getSession: (
      headers: Headers
    ) => Effect.Effect<SessionData | null, SessionLookupError>;
  }
>()("SessionProvider") {}

export const requireAuthorizedSession = Effect.fn("Connect.requireSession")(
  function* (headers: Headers) {
    const sessionProvider = yield* SessionProvider;
    const session = yield* sessionProvider.getSession(headers);
    if (!session) return yield* new ConnectUnauthorizedError();
    yield* Effect.annotateCurrentSpan("userId", maskId(session.userId));
    return session;
  }
);

export class ApiKeyStore extends Context.Service<
  ApiKeyStore,
  {
    readonly listByUser: (
      userId: UserId
    ) => Effect.Effect<ApiKeyInfo[], DbError>;
    readonly deleteById: (id: ApiKeyRowId) => Effect.Effect<void, DbError>;
    readonly create: (
      headers: Headers,
      metadata: { orgId: OrgId; source: string },
      name: string
    ) => Effect.Effect<{ key: ApiKey; id: ApiKeyRowId }, KeyCreationError>;
    readonly updateName: (
      id: ApiKeyRowId,
      name: string
    ) => Effect.Effect<void, DbError>;
  }
>()("ApiKeyStore") {}

export class VerificationStore extends Context.Service<
  VerificationStore,
  {
    readonly save: (
      identifier: string,
      data: VerificationData,
      ttlMs: number
    ) => Effect.Effect<void, DbError>;
    readonly consumeByIdentifier: (
      identifier: string
    ) => Effect.Effect<
      VerificationRecord | null,
      DbError | InvalidVerificationPayloadError
    >;
  }
>()("VerificationStore") {}

export const TelegramConnectCode = Schema.Struct({
  recordId: Schema.String,
  chatId: Schema.Number,
});
export type TelegramConnectCode = typeof TelegramConnectCode.Type;

export class TelegramConnectStore extends Context.Service<
  TelegramConnectStore,
  {
    readonly issueCode: (chatId: number) => Effect.Effect<string, DbError>;
    readonly findByCode: (
      code: string
    ) => Effect.Effect<
      TelegramConnectCode | null,
      DbError | InvalidVerificationPayloadError
    >;
    readonly consumeByCode: (
      code: string
    ) => Effect.Effect<
      TelegramConnectCode | null,
      DbError | InvalidVerificationPayloadError
    >;
  }
>()("TelegramConnectStore") {}
