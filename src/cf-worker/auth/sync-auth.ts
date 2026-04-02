import { Effect, Schema } from "effect";

import type { Auth } from "./index";

export type SyncAuthErrorCode =
  | "SESSION_EXPIRED"
  | "ACCESS_DENIED"
  | "UNAPPROVED";

export class SyncAuthError extends Schema.TaggedError<SyncAuthError>()(
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
  storeId: string,
  auth: Auth
) {
    if (!cookie) {
      return yield* new SyncAuthError({
        code: "SESSION_EXPIRED",
        message: "No session cookie",
        status: 401,
      });
    }

    const session = yield* Effect.tryPromise({
      catch: () =>
        new SyncAuthError({
          code: "SESSION_EXPIRED",
          message: "Failed to validate session",
          status: 401,
        }),
      try: () => auth.api.getSession({ headers: new Headers({ cookie }) }),
    });

    if (!session?.session) {
      return yield* new SyncAuthError({
        code: "SESSION_EXPIRED",
        message: "Session expired or invalid",
        status: 401,
      });
    }

    if (!session.user.approved) {
      return yield* new SyncAuthError({
        code: "UNAPPROVED",
        message: "Account pending approval",
        status: 403,
      });
    }

    if (session.session.activeOrganizationId !== storeId) {
      return yield* new SyncAuthError({
        code: "ACCESS_DENIED",
        message: "You do not have access to this workspace",
        status: 403,
      });
    }

    return { userId: session.user.id };
  });
