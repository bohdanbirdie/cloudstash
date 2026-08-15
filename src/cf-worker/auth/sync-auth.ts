import { Effect, Schema } from "effect";

import { OrgId } from "../db/branded";
import { WorkspaceAccess } from "./workspace-access";

export type SyncAuthErrorCode =
  | "SESSION_EXPIRED"
  | "ACCESS_DENIED"
  | "UNAPPROVED"
  | "UNKNOWN";

export class SyncAuthError extends Schema.TaggedErrorClass<SyncAuthError>()(
  "SyncAuthError",
  {
    status: Schema.Number,
    code: Schema.String,
    message: Schema.String,
  }
) {}

/**
 * Pre-flight auth check for sync connections.
 * Currently assumes storeId === activeOrganizationId.
 * Extend this when adding non-org store types.
 */
export const checkSyncAuth = Effect.fn("Auth.checkSyncAuth")(function* (
  cookie: string | null,
  storeId: OrgId
) {
  if (!cookie) {
    return yield* new SyncAuthError({
      code: "SESSION_EXPIRED",
      message: "No session cookie",
      status: 401,
    });
  }

  const access = yield* WorkspaceAccess;
  return yield* access
    .authorize(
      { _tag: "Session", headers: new Headers({ cookie }) },
      OrgId.make(storeId)
    )
    .pipe(
      Effect.catchTags({
        WorkspaceCredentialInvalidError: () =>
          Effect.fail(
            new SyncAuthError({
              code: "SESSION_EXPIRED",
              message: "Session expired or invalid",
              status: 401,
            })
          ),
        WorkspaceScopeMissingError: () =>
          Effect.fail(
            new SyncAuthError({
              code: "ACCESS_DENIED",
              message: "No active workspace",
              status: 403,
            })
          ),
        WorkspaceScopeMismatchError: () =>
          Effect.fail(
            new SyncAuthError({
              code: "ACCESS_DENIED",
              message: "You do not have access to this workspace",
              status: 403,
            })
          ),
        WorkspaceUserUnapprovedError: () =>
          Effect.fail(
            new SyncAuthError({
              code: "UNAPPROVED",
              message: "Account pending approval",
              status: 403,
            })
          ),
        WorkspaceMembershipRevokedError: () =>
          Effect.fail(
            new SyncAuthError({
              code: "ACCESS_DENIED",
              message: "You do not have access to this workspace",
              status: 403,
            })
          ),
        WorkspaceApiKeyReferenceMissingError: () =>
          Effect.fail(
            new SyncAuthError({
              code: "SESSION_EXPIRED",
              message: "Session expired or invalid",
              status: 401,
            })
          ),
        WorkspaceAccessBackendError: () =>
          Effect.fail(
            new SyncAuthError({
              code: "UNKNOWN",
              message: "Authentication backend unavailable",
              status: 503,
            })
          ),
      })
    );
});
