import { Effect, Data } from "effect";

import { type Auth } from "./index";

export type SyncAuthErrorCode =
  | "SESSION_EXPIRED"
  | "ACCESS_DENIED"
  | "UNAPPROVED";

export class SyncAuthError extends Data.TaggedError("SyncAuthError")<{
  status: number;
  code: SyncAuthErrorCode;
  message: string;
}> {}

/**
 * Pre-flight auth check for sync connections.
 * Currently assumes storeId === activeOrganizationId.
 * Extend this when adding non-org store types.
 */
export const checkSyncAuth = (
  cookie: string | null,
  storeId: string,
  auth: Auth
): Effect.Effect<{ userId: string }, SyncAuthError> =>
  Effect.gen(function* checkSyncAuth() {
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

    const user = session.user as typeof session.user & { approved?: boolean };
    if (!user.approved) {
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
