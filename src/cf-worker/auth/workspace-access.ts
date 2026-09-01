import { and, eq } from "drizzle-orm";
import { Context, Effect, Match, Option, Schema } from "effect";

import type { Auth } from ".";
import type { Database } from "../db";
import { ApiKey, OrgId, UserId } from "../db/branded";
import * as dbSchema from "../db/schema";
import { DbError, query } from "../db/service";
import { maskId } from "../log-utils";
import { decodeApiKeyMetadata } from "../sync/auth-payload";

export class WorkspaceCredentialInvalidError extends Schema.TaggedError<WorkspaceCredentialInvalidError>()(
  "WorkspaceCredentialInvalidError",
  {
    credential: Schema.Literals(["session", "apiKey"]),
  }
) {}

export class WorkspaceScopeMissingError extends Schema.TaggedError<WorkspaceScopeMissingError>()(
  "WorkspaceScopeMissingError",
  {
    credential: Schema.Literals(["session", "apiKey"]),
  }
) {}

export class WorkspaceApiKeyReferenceMissingError extends Schema.TaggedError<WorkspaceApiKeyReferenceMissingError>()(
  "WorkspaceApiKeyReferenceMissingError",
  {}
) {}

export class WorkspaceScopeMismatchError extends Schema.TaggedError<WorkspaceScopeMismatchError>()(
  "WorkspaceScopeMismatchError",
  {
    authorizedOrgId: OrgId,
    requestedOrgId: OrgId,
  }
) {}

export class WorkspaceUserUnapprovedError extends Schema.TaggedError<WorkspaceUserUnapprovedError>()(
  "WorkspaceUserUnapprovedError",
  {
    userId: UserId,
  }
) {}

export class WorkspaceMembershipRevokedError extends Schema.TaggedError<WorkspaceMembershipRevokedError>()(
  "WorkspaceMembershipRevokedError",
  {
    orgId: OrgId,
    userId: UserId,
  }
) {}

export class WorkspaceAccessBackendError extends Schema.TaggedError<WorkspaceAccessBackendError>()(
  "WorkspaceAccessBackendError",
  {
    operation: Schema.Literals([
      "getSession",
      "verifyApiKey",
      "lookupUser",
      "lookupMembership",
    ]),
    cause: Schema.Defect(),
  }
) {}

export const WorkspaceAccessError = Schema.Union([
  WorkspaceCredentialInvalidError,
  WorkspaceScopeMissingError,
  WorkspaceApiKeyReferenceMissingError,
  WorkspaceScopeMismatchError,
  WorkspaceUserUnapprovedError,
  WorkspaceMembershipRevokedError,
  WorkspaceAccessBackendError,
]);
export type WorkspaceAccessError = typeof WorkspaceAccessError.Type;
export type WorkspaceAccessDeniedError = Exclude<
  WorkspaceAccessError,
  WorkspaceAccessBackendError
>;

export const WorkspaceAuthorization = Schema.Struct({
  orgId: OrgId,
  source: Schema.optional(Schema.String),
  userId: UserId,
});
export type WorkspaceAuthorization = typeof WorkspaceAuthorization.Type;

const SessionResult = Schema.Struct({
  session: Schema.Struct({
    activeOrganizationId: Schema.optional(Schema.NullOr(Schema.String)),
  }),
  user: Schema.Struct({ id: Schema.String }),
});
const VerifyApiKeyResult = Schema.Union([
  Schema.Struct({
    valid: Schema.Literal(false),
    key: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    valid: Schema.Literal(true),
    key: Schema.Struct({
      metadata: Schema.Unknown,
      referenceId: Schema.optional(Schema.NullOr(Schema.String)),
    }),
  }),
]);

const decodeSessionResult = Schema.decodeUnknownEffect(SessionResult);
const decodeVerifyApiKeyResult = Schema.decodeUnknownEffect(VerifyApiKeyResult);

type WorkspaceAccessForbiddenError =
  | WorkspaceScopeMismatchError
  | WorkspaceUserUnapprovedError
  | WorkspaceMembershipRevokedError;

type WorkspaceAccessUnauthorizedError =
  | WorkspaceCredentialInvalidError
  | WorkspaceApiKeyReferenceMissingError;

export const matchWorkspaceAccessError = <Result>(
  error: WorkspaceAccessError,
  handlers: {
    readonly unauthorized: (error: WorkspaceAccessUnauthorizedError) => Result;
    readonly missingScope: (error: WorkspaceScopeMissingError) => Result;
    readonly forbidden: (error: WorkspaceAccessForbiddenError) => Result;
    readonly backend: (error: WorkspaceAccessBackendError) => Result;
  }
): Result =>
  Match.typeTags<WorkspaceAccessError, Result>()({
    WorkspaceCredentialInvalidError: handlers.unauthorized,
    WorkspaceApiKeyReferenceMissingError: handlers.unauthorized,
    WorkspaceScopeMissingError: handlers.missingScope,
    WorkspaceScopeMismatchError: handlers.forbidden,
    WorkspaceUserUnapprovedError: handlers.forbidden,
    WorkspaceMembershipRevokedError: handlers.forbidden,
    WorkspaceAccessBackendError: handlers.backend,
  })(error);

const remapDbError = (operation: "lookupUser" | "lookupMembership") =>
  Effect.mapError(
    (error: DbError) =>
      new WorkspaceAccessBackendError({ operation, cause: error.cause })
  );

const resolveSession = Effect.fnUntraced(function* (
  auth: Auth,
  headers: Headers
) {
  const result = yield* Effect.tryPromise({
    try: () => auth.api.getSession({ headers }),
    catch: (cause) =>
      new WorkspaceAccessBackendError({ operation: "getSession", cause }),
  });
  const present = yield* Effect.fromOption(
    Option.fromNullishOr(result),
    () => new WorkspaceCredentialInvalidError({ credential: "session" })
  );
  const session = yield* decodeSessionResult(present).pipe(
    Effect.mapError(
      (cause) =>
        new WorkspaceAccessBackendError({ operation: "getSession", cause })
    )
  );
  const orgId = yield* Effect.fromOption(
    Option.fromNullishOr(session.session.activeOrganizationId).pipe(
      Option.filter((id) => id.length > 0),
      Option.map((id) => OrgId.make(id))
    ),
    () => new WorkspaceScopeMissingError({ credential: "session" })
  );
  return { orgId, userId: UserId.make(session.user.id) };
});

const resolveApiKey = Effect.fnUntraced(function* (auth: Auth, apiKey: ApiKey) {
  const result = yield* Effect.tryPromise({
    try: () => auth.api.verifyApiKey({ body: { key: apiKey } }),
    catch: (cause) =>
      new WorkspaceAccessBackendError({ operation: "verifyApiKey", cause }),
  });
  const verification = yield* decodeVerifyApiKeyResult(result).pipe(
    Effect.mapError(
      (cause) =>
        new WorkspaceAccessBackendError({ operation: "verifyApiKey", cause })
    )
  );
  const verifiedKey = yield* Match.value(verification).pipe(
    Match.when({ valid: false }, () =>
      Effect.fail(new WorkspaceCredentialInvalidError({ credential: "apiKey" }))
    ),
    Match.when({ valid: true }, ({ key }) => Effect.succeed(key)),
    Match.exhaustive
  );
  const metadata = yield* Effect.fromOption(
    decodeApiKeyMetadata(verifiedKey.metadata),
    () => new WorkspaceScopeMissingError({ credential: "apiKey" })
  );
  const userId = yield* Effect.fromOption(
    Option.fromNullishOr(verifiedKey.referenceId).pipe(
      Option.filter((id) => id.length > 0),
      Option.map((id) => UserId.make(id))
    ),
    () => new WorkspaceApiKeyReferenceMissingError()
  );
  return {
    orgId: metadata.orgId,
    ...(metadata.source === undefined ? {} : { source: metadata.source }),
    userId,
  };
});

const make = (auth: Auth, db: Database) => {
  const authorizeResolved = Effect.fnUntraced(function* (
    resolved: WorkspaceAuthorization,
    requestedOrgId?: OrgId
  ) {
    yield* Effect.annotateCurrentSpan({
      orgId: maskId(resolved.orgId),
      userId: maskId(resolved.userId),
    });

    if (
      requestedOrgId !== undefined &&
      (requestedOrgId.length === 0 || requestedOrgId !== resolved.orgId)
    ) {
      return yield* new WorkspaceScopeMismatchError({
        authorizedOrgId: resolved.orgId,
        requestedOrgId,
      });
    }

    const user = yield* query(
      db.query.user.findFirst({
        columns: { approved: true },
        where: eq(dbSchema.user.id, resolved.userId),
      })
    ).pipe(remapDbError("lookupUser"));
    yield* Effect.fromOption(
      Option.fromNullishOr(user).pipe(
        Option.filter(({ approved }) => approved === true)
      ),
      () => new WorkspaceUserUnapprovedError({ userId: resolved.userId })
    );

    const membership = yield* query(
      db.query.member.findFirst({
        columns: { id: true },
        where: and(
          eq(dbSchema.member.userId, resolved.userId),
          eq(dbSchema.member.organizationId, resolved.orgId)
        ),
      })
    ).pipe(remapDbError("lookupMembership"));
    yield* Effect.fromOption(
      Option.fromNullishOr(membership),
      () => new WorkspaceMembershipRevokedError(resolved)
    );

    return resolved;
  });

  return {
    // Deliberately untraced: these hot per-request validators enrich the
    // existing boundary span without emitting failed child spans for normal
    // authorization denials.
    authorizeSession: Effect.fnUntraced(function* (
      headers: Headers,
      requestedOrgId?: OrgId
    ) {
      return yield* authorizeResolved(
        yield* resolveSession(auth, headers),
        requestedOrgId
      );
    }),
    authorizeApiKey: Effect.fnUntraced(function* (
      apiKey: ApiKey,
      requestedOrgId?: OrgId
    ) {
      return yield* authorizeResolved(
        yield* resolveApiKey(auth, apiKey),
        requestedOrgId
      );
    }),
    authorizeIdentity: Effect.fnUntraced(function* (
      resolved: WorkspaceAuthorization,
      requestedOrgId?: OrgId
    ) {
      return yield* authorizeResolved(resolved, requestedOrgId);
    }),
  };
};

export type WorkspaceAccessService = ReturnType<typeof make>;

export class WorkspaceAccess extends Context.Service<
  WorkspaceAccess,
  WorkspaceAccessService
>()("@cloudstash/WorkspaceAccess") {}

export const makeWorkspaceAccess = make;
