import { Effect } from "effect";

import { AppLayerLive, AuthClient } from "../auth/service";
import { OrgId, UserId } from "../db/branded";
import { maskId, safeErrorInfo } from "../log-utils";
import type { Env } from "../shared";
import { decodeApiKeyMetadata, decodeExtensionPayload } from "./auth-payload";
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

const deny = (reason: string, error: SyncAuthError) =>
  Effect.gen(function* () {
    yield* Effect.logWarning(`Sync auth failed: ${reason}`);
    return yield* error;
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
    const auth = yield* AuthClient;
    const { storeId, headers, allowedExtensionIds } = context;
    const cookie = headers.get("cookie");
    const origin = headers.get("origin");

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

      const decoded = decodeExtensionPayload(payload);
      if (decoded._tag === "None") {
        return yield* deny("missing apiKey", new InvalidSessionError());
      }

      const verify = yield* Effect.tryPromise({
        catch: (cause) => new AuthBackendError({ cause }),
        try: () =>
          auth.api.verifyApiKey({ body: { key: decoded.value.apiKey } }),
      });
      if (!verify.valid || !verify.key) {
        return yield* deny("invalid apiKey", new InvalidSessionError());
      }

      const metadata = decodeApiKeyMetadata(verify.key.metadata);
      if (metadata._tag === "None") {
        return yield* deny("invalid key metadata", new InvalidSessionError());
      }
      if (metadata.value.orgId !== storeId) {
        return yield* new OrgAccessDeniedError({
          sessionOrgId: metadata.value.orgId,
          storeId,
        });
      }

      const referenceId = verify.key.referenceId;
      if (!referenceId) {
        yield* Effect.logError("API key missing referenceId");
        return yield* new MissingApiKeyReferenceError();
      }
      return { userId: UserId.make(referenceId) };
    }

    if (!cookie) {
      return yield* deny("missing cookie", new MissingSessionCookieError());
    }

    const session = yield* Effect.tryPromise({
      catch: (cause) => new AuthBackendError({ cause }),
      try: () => auth.api.getSession({ headers: new Headers({ cookie }) }),
    });
    if (!session?.session) {
      return yield* deny("invalid session", new InvalidSessionError());
    }

    const sessionOrgId = session.session.activeOrganizationId;
    if (sessionOrgId !== storeId) {
      return yield* deny(
        `org mismatch (session ${maskId(sessionOrgId ?? "none")})`,
        new OrgAccessDeniedError({
          sessionOrgId: sessionOrgId ? OrgId.make(sessionOrgId) : null,
          storeId,
        })
      );
    }

    return { userId: UserId.make(session.user.id) };
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
              "You do not have access to this workspace",
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
      Effect.catchAllDefect((cause) =>
        Effect.logError("Sync validatePayload defect").pipe(
          Effect.annotateLogs(safeErrorInfo(cause)),
          Effect.as(authError("UNKNOWN", "Internal error", 500))
        )
      ),
      Effect.provide(AppLayerLive(env))
    )
  );
};
