import { and, eq } from "drizzle-orm";
import { Context, Effect, Option, Schema } from "effect";

import type { Auth } from ".";
import type { Database } from "../db";
import { ApiKey, OrgId, UserId } from "../db/branded";
import * as dbSchema from "../db/schema";
import { DbError, query } from "../db/service";
import { maskId } from "../log-utils";
import { decodeApiKeyMetadata } from "../sync/auth-payload";

export class WorkspaceCredentialInvalidError extends Schema.TaggedErrorClass<WorkspaceCredentialInvalidError>()(
  "WorkspaceCredentialInvalidError",
  {
    credential: Schema.Literals(["session", "apiKey"]),
  }
) {}

export class WorkspaceScopeMissingError extends Schema.TaggedErrorClass<WorkspaceScopeMissingError>()(
  "WorkspaceScopeMissingError",
  {
    credential: Schema.Literals(["session", "apiKey"]),
  }
) {}

export class WorkspaceApiKeyReferenceMissingError extends Schema.TaggedErrorClass<WorkspaceApiKeyReferenceMissingError>()(
  "WorkspaceApiKeyReferenceMissingError",
  {}
) {}

export class WorkspaceScopeMismatchError extends Schema.TaggedErrorClass<WorkspaceScopeMismatchError>()(
  "WorkspaceScopeMismatchError",
  {
    authorizedOrgId: OrgId,
    requestedOrgId: OrgId,
  }
) {}

export class WorkspaceUserUnapprovedError extends Schema.TaggedErrorClass<WorkspaceUserUnapprovedError>()(
  "WorkspaceUserUnapprovedError",
  {
    userId: UserId,
  }
) {}

export class WorkspaceMembershipRevokedError extends Schema.TaggedErrorClass<WorkspaceMembershipRevokedError>()(
  "WorkspaceMembershipRevokedError",
  {
    orgId: OrgId,
    userId: UserId,
  }
) {}

export class WorkspaceAccessBackendError extends Schema.TaggedErrorClass<WorkspaceAccessBackendError>()(
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

export type WorkspaceAccessError =
  | WorkspaceCredentialInvalidError
  | WorkspaceScopeMissingError
  | WorkspaceApiKeyReferenceMissingError
  | WorkspaceScopeMismatchError
  | WorkspaceUserUnapprovedError
  | WorkspaceMembershipRevokedError
  | WorkspaceAccessBackendError;

export type WorkspaceCredential =
  | { readonly _tag: "Session"; readonly headers: Headers }
  | { readonly _tag: "ApiKey"; readonly apiKey: ApiKey };

export interface WorkspaceAuthorization {
  readonly orgId: OrgId;
  readonly userId: UserId;
}

export class WorkspaceAccess extends Context.Service<
  WorkspaceAccess,
  {
    readonly authorize: (
      credential: WorkspaceCredential,
      requestedOrgId?: OrgId
    ) => Effect.Effect<WorkspaceAuthorization, WorkspaceAccessError>;
  }
>()("@cloudstash/WorkspaceAccess") {}

const remapDbError = (operation: "lookupUser" | "lookupMembership") =>
  Effect.mapError(
    (error: DbError) =>
      new WorkspaceAccessBackendError({ operation, cause: error.cause })
  );

export const makeWorkspaceAccess = (
  auth: Auth,
  db: Database
): WorkspaceAccess["Service"] =>
  WorkspaceAccess.of({
    authorize: Effect.fnUntraced(function* (credential, requestedOrgId) {
      const resolved = yield* Effect.gen(function* () {
        if (credential._tag === "Session") {
          const session = yield* Effect.tryPromise({
            try: () => auth.api.getSession({ headers: credential.headers }),
            catch: (cause) =>
              new WorkspaceAccessBackendError({
                operation: "getSession",
                cause,
              }),
          });
          if (!session?.session) {
            return yield* new WorkspaceCredentialInvalidError({
              credential: "session",
            });
          }
          const rawOrgId = session.session.activeOrganizationId;
          if (!rawOrgId) {
            return yield* new WorkspaceScopeMissingError({
              credential: "session",
            });
          }
          return {
            orgId: OrgId.make(rawOrgId),
            userId: UserId.make(session.user.id),
          };
        }

        const verify = yield* Effect.tryPromise({
          try: () =>
            auth.api.verifyApiKey({ body: { key: credential.apiKey } }),
          catch: (cause) =>
            new WorkspaceAccessBackendError({
              operation: "verifyApiKey",
              cause,
            }),
        });
        if (!verify.valid || !verify.key) {
          return yield* new WorkspaceCredentialInvalidError({
            credential: "apiKey",
          });
        }

        const metadata = decodeApiKeyMetadata(verify.key.metadata);
        if (Option.isNone(metadata)) {
          return yield* new WorkspaceScopeMissingError({
            credential: "apiKey",
          });
        }
        const referenceId = verify.key.referenceId;
        if (!referenceId) {
          return yield* new WorkspaceApiKeyReferenceMissingError();
        }
        return {
          orgId: metadata.value.orgId,
          userId: UserId.make(referenceId),
        };
      });

      yield* Effect.annotateCurrentSpan({
        orgId: maskId(resolved.orgId),
        userId: maskId(resolved.userId),
      });

      if (requestedOrgId && requestedOrgId !== resolved.orgId) {
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
      if (user?.approved !== true) {
        return yield* new WorkspaceUserUnapprovedError({
          userId: resolved.userId,
        });
      }

      const membership = yield* query(
        db.query.member.findFirst({
          columns: { id: true },
          where: and(
            eq(dbSchema.member.userId, resolved.userId),
            eq(dbSchema.member.organizationId, resolved.orgId)
          ),
        })
      ).pipe(remapDbError("lookupMembership"));
      if (!membership) {
        return yield* new WorkspaceMembershipRevokedError({
          orgId: resolved.orgId,
          userId: resolved.userId,
        });
      }

      return resolved;
    }),
  });
