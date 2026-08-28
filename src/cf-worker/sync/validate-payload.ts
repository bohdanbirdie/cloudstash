import { Effect, Match, Option, Schema } from "effect";

import { AppLayerLive } from "../auth/service";
import {
  WorkspaceAccess,
  matchWorkspaceAccessError,
} from "../auth/workspace-access";
import { OrgId, UserId } from "../db/branded";
import { maskId, safeErrorInfo } from "../log-utils";
import type { Env } from "../shared";
import { decodeExtensionPayload } from "./auth-payload";
import {
  AuthBackendError,
  ForbiddenExtensionOriginError,
  InvalidSessionError,
  MissingApiKeyReferenceError,
  MissingSessionCookieError,
  OrgAccessDeniedError,
} from "./errors";
import type { SyncAuthError } from "./errors";

const EXTENSION_ORIGIN_PREFIX = "chrome-extension://";
const RequestedStoreId = OrgId.check(Schema.isMinLength(1));

const extensionId = (value: string): string =>
  value.replace(EXTENSION_ORIGIN_PREFIX, "").replace(/\/+$/, "");

export const parseExtensionAllowlist = (
  raw: string | undefined
): ReadonlySet<string> =>
  new Set(
    (raw ?? "")
      .split(",")
      .map((entry) => extensionId(entry.trim()))
      .filter((entry) => entry.length > 0)
  );

const deny = Effect.fnUntraced(function* (
  reason: string,
  error: SyncAuthError
) {
  yield* Effect.logWarning(`Sync auth failed: ${reason}`);
  return yield* error;
});

const translateWorkspaceAccess = (
  error: Parameters<typeof matchWorkspaceAccessError>[0],
  storeId: OrgId
): SyncAuthError =>
  matchWorkspaceAccessError<SyncAuthError>(error, {
    unauthorized: (unauthorized) =>
      Match.value(unauthorized).pipe(
        Match.tag(
          "WorkspaceApiKeyReferenceMissingError",
          () => new MissingApiKeyReferenceError()
        ),
        Match.orElse(() => new InvalidSessionError())
      ),
    missingScope: () => new InvalidSessionError(),
    forbidden: (forbidden) => {
      const sessionOrgId = Match.value(forbidden).pipe(
        Match.tag(
          "WorkspaceScopeMismatchError",
          ({ authorizedOrgId }) => authorizedOrgId
        ),
        Match.tag("WorkspaceMembershipRevokedError", ({ orgId }) => orgId),
        Match.orElse(() => null)
      );
      return new OrgAccessDeniedError({ sessionOrgId, storeId });
    },
    backend: ({ cause }) => new AuthBackendError({ cause }),
  });

export const validatePayload = Effect.fn("Sync.validatePayload")(
  function* (
    payload: unknown,
    context: {
      storeId: OrgId;
      headers: ReadonlyMap<string, string>;
      allowedExtensionIds: ReadonlySet<string>;
    }
  ) {
    const { storeId, headers, allowedExtensionIds } = context;
    const cookie = headers.get("cookie");
    const origin = headers.get("origin");

    if (Option.isNone(Schema.decodeUnknownOption(RequestedStoreId)(storeId))) {
      return yield* deny(
        "empty storeId",
        new OrgAccessDeniedError({ sessionOrgId: null, storeId })
      );
    }

    if (!cookie && origin?.startsWith(EXTENSION_ORIGIN_PREFIX)) {
      if (
        allowedExtensionIds.size > 0 &&
        !allowedExtensionIds.has(extensionId(origin))
      ) {
        return yield* deny(
          `extension origin not allow-listed: ${origin}`,
          new ForbiddenExtensionOriginError({ origin })
        );
      }

      const access = yield* WorkspaceAccess;
      return yield* Option.match(decodeExtensionPayload(payload), {
        onNone: () => deny("missing apiKey", new InvalidSessionError()),
        onSome: ({ apiKey }) =>
          access
            .authorizeApiKey(apiKey, storeId)
            .pipe(
              Effect.mapError((error) =>
                translateWorkspaceAccess(error, storeId)
              )
            ),
      });
    }

    if (!cookie) {
      return yield* deny("missing cookie", new MissingSessionCookieError());
    }

    const access = yield* WorkspaceAccess;
    return yield* access
      .authorizeSession(new Headers({ cookie }), storeId)
      .pipe(
        Effect.mapError((error) => translateWorkspaceAccess(error, storeId))
      );
  },
  (effect, _payload, context) =>
    Effect.annotateLogs(effect, { storeId: maskId(context.storeId) })
);

// Body shape `{ code, message }` matches the legacy /api/sync/auth contract the
// client parses into SyncErrorCode (src/stores/sync-status-store.ts).
const authError = (code: string, message: string, status: number): Response =>
  new Response(JSON.stringify({ code, message, status }), {
    headers: { "Content-Type": "application/json" },
    status,
  });

export const runSyncAuth = (
  payload: unknown,
  rawStoreId: string,
  requestHeaders: Headers,
  env: Env
): Promise<{ userId: UserId } | Response> => {
  const headers = new Map<string, string>();
  requestHeaders.forEach((value, key) => headers.set(key, value));
  const storeId = OrgId.make(rawStoreId);
  const allowedExtensionIds = parseExtensionAllowlist(
    env.EXTENSION_ID_ALLOWLIST
  );

  return Effect.runPromise(
    validatePayload(payload, { storeId, headers, allowedExtensionIds }).pipe(
      Effect.catchTags({
        MissingSessionCookieError: () =>
          Effect.succeed(
            authError("SESSION_EXPIRED", "No session cookie", 401)
          ),
        InvalidSessionError: () =>
          Effect.succeed(
            authError("SESSION_EXPIRED", "Session expired or invalid", 401)
          ),
        MissingApiKeyReferenceError: () =>
          Effect.succeed(authError("SESSION_EXPIRED", "Invalid API key", 401)),
        OrgAccessDeniedError: () =>
          Effect.succeed(
            authError(
              "ACCESS_DENIED",
              "You do not have access to this library",
              403
            )
          ),
        ForbiddenExtensionOriginError: () =>
          Effect.succeed(authError("ACCESS_DENIED", "Forbidden", 403)),
        AuthBackendError: (e) =>
          Effect.logError("Auth backend unavailable").pipe(
            Effect.annotateLogs(safeErrorInfo(e.cause)),
            Effect.as(authError("UNKNOWN", "Auth backend unavailable", 503))
          ),
      }),
      Effect.catchDefect((cause) =>
        Effect.logError("Sync validatePayload defect").pipe(
          Effect.annotateLogs(safeErrorInfo(cause)),
          Effect.as(authError("UNKNOWN", "Internal error", 500))
        )
      ),
      Effect.provide(AppLayerLive(env))
    )
  );
};
