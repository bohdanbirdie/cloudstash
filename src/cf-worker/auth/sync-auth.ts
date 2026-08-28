import { Effect, Match, Schema } from "effect";

import { OrgId } from "../db/branded";
import { WorkspaceAccess, matchWorkspaceAccessError } from "./workspace-access";

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

const syncAuthError = (
  code: SyncAuthErrorCode,
  message: string,
  status: number
) => new SyncAuthError({ code, message, status });

const translateWorkspaceAccess = (
  error: Parameters<typeof matchWorkspaceAccessError>[0]
) =>
  matchWorkspaceAccessError<SyncAuthError>(error, {
    unauthorized: () =>
      syncAuthError("SESSION_EXPIRED", "Session expired or invalid", 401),
    missingScope: () =>
      syncAuthError("ACCESS_DENIED", "No library is available", 403),
    forbidden: (forbidden) =>
      Match.value(forbidden).pipe(
        Match.tag("WorkspaceUserUnapprovedError", () =>
          syncAuthError("UNAPPROVED", "Account pending approval", 403)
        ),
        Match.orElse(() =>
          syncAuthError(
            "ACCESS_DENIED",
            "You do not have access to this library",
            403
          )
        )
      ),
    backend: () =>
      syncAuthError("UNKNOWN", "Authentication backend unavailable", 503),
  });

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
    .authorizeSession(new Headers({ cookie }), OrgId.make(storeId))
    .pipe(Effect.mapError(translateWorkspaceAccess));
});
