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

export const validatePayload = Effect.fn("Sync.validatePayload")(function* (
  payload: unknown,
  context: {
    storeId: OrgId;
    headers: ReadonlyMap<string, string>;
    allowedExtensionIds: ReadonlySet<string>;
  }
) {
  const auth = yield* AuthClient;
  const cookie = context.headers.get("cookie");
  const origin = context.headers.get("origin");
  const isExtensionOrigin =
    origin?.startsWith(EXTENSION_ORIGIN_PREFIX) ?? false;
  const { storeId, allowedExtensionIds } = context;

  if (!cookie && isExtensionOrigin) {
    if (
      allowedExtensionIds.size > 0 &&
      (origin === undefined || !allowedExtensionIds.has(extensionId(origin)))
    ) {
      yield* Effect.logWarning(
        "Sync auth failed: extension origin not allow-listed"
      ).pipe(
        Effect.annotateLogs({
          storeId: maskId(storeId),
          origin: origin ?? "none",
        })
      );
      return yield* new ForbiddenExtensionOriginError({ origin: origin ?? "" });
    }
    const decoded = decodeExtensionPayload(payload);
    if (decoded._tag === "None") {
      yield* Effect.logWarning("Sync auth failed: missing apiKey").pipe(
        Effect.annotateLogs({ storeId: maskId(storeId) })
      );
      return yield* new InvalidSessionError();
    }
    const verify = yield* Effect.tryPromise({
      catch: (cause) => new AuthBackendError({ cause }),
      try: () => auth.api.verifyApiKey({ body: { key: decoded.value.apiKey } }),
    });
    if (!verify.valid || !verify.key) {
      yield* Effect.logWarning("Sync auth failed: invalid apiKey").pipe(
        Effect.annotateLogs({ storeId: maskId(storeId) })
      );
      return yield* new InvalidSessionError();
    }
    const metadataOpt = decodeApiKeyMetadata(verify.key.metadata);
    if (metadataOpt._tag === "None") {
      yield* Effect.logWarning("Sync auth failed: invalid key metadata").pipe(
        Effect.annotateLogs({ storeId: maskId(storeId) })
      );
      return yield* new InvalidSessionError();
    }
    if (metadataOpt.value.orgId !== storeId) {
      return yield* new OrgAccessDeniedError({
        sessionOrgId: metadataOpt.value.orgId,
        storeId,
      });
    }
    const referenceId = verify.key.referenceId;
    if (!referenceId) {
      yield* Effect.logError("API key missing referenceId").pipe(
        Effect.annotateLogs({ storeId: maskId(storeId) })
      );
      return yield* new MissingApiKeyReferenceError();
    }
    yield* Effect.logDebug("Sync auth OK via apiKey").pipe(
      Effect.annotateLogs({ storeId: maskId(storeId) })
    );
    return { userId: UserId.make(referenceId) };
  }

  if (!cookie) {
    yield* Effect.logWarning("Sync auth failed: missing cookie").pipe(
      Effect.annotateLogs({ storeId: maskId(storeId) })
    );
    return yield* new MissingSessionCookieError();
  }

  const session = yield* Effect.tryPromise({
    catch: (cause) => new AuthBackendError({ cause }),
    try: () => auth.api.getSession({ headers: new Headers({ cookie }) }),
  });

  if (!session?.session) {
    yield* Effect.logWarning("Sync auth failed: invalid session").pipe(
      Effect.annotateLogs({ storeId: maskId(storeId) })
    );
    return yield* new InvalidSessionError();
  }

  if (session.session.activeOrganizationId !== storeId) {
    yield* Effect.logWarning("Sync auth failed: org mismatch").pipe(
      Effect.annotateLogs({
        storeId: maskId(storeId),
        sessionOrgId: maskId(session.session.activeOrganizationId ?? "none"),
      })
    );
    return yield* new OrgAccessDeniedError({
      sessionOrgId: session.session.activeOrganizationId
        ? OrgId.make(session.session.activeOrganizationId)
        : null,
      storeId,
    });
  }

  yield* Effect.logDebug("Sync auth OK").pipe(
    Effect.annotateLogs({ storeId: maskId(storeId) })
  );
  return { userId: UserId.make(session.user.id) };
});

const jsonResponse = (body: object, status: number): Response =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });

/**
 * Runs the sync auth check and maps tagged failures to HTTP responses.
 * Returns either the authenticated userId or a Response to short-circuit.
 */
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
          Effect.succeed(jsonResponse({ error: "No session cookie" }, 401)),
        InvalidSessionError: () =>
          Effect.succeed(
            jsonResponse({ error: "Invalid or expired session" }, 401)
          ),
        OrgAccessDeniedError: () =>
          Effect.succeed(jsonResponse({ error: "Access denied" }, 403)),
        AuthBackendError: (e) =>
          Effect.logError("Auth backend unavailable").pipe(
            Effect.annotateLogs(safeErrorInfo(e.cause)),
            Effect.as(jsonResponse({ error: "Auth backend unavailable" }, 503))
          ),
        MissingApiKeyReferenceError: () =>
          Effect.succeed(jsonResponse({ error: "Invalid API key" }, 401)),
        ForbiddenExtensionOriginError: () =>
          Effect.succeed(jsonResponse({ error: "Forbidden" }, 403)),
      }),
      Effect.catchAllDefect((cause) =>
        Effect.logError("Sync validatePayload defect").pipe(
          Effect.annotateLogs(safeErrorInfo(cause)),
          Effect.as(jsonResponse({ error: "Internal error" }, 500))
        )
      ),
      Effect.provide(AppLayerLive(env))
    )
  );
};
