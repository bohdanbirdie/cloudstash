import { eq } from "drizzle-orm";
import { Effect, Layer, Option } from "effect";

import { bearerApiKey } from "../auth/bearer-api-key";
import { AppLayerLive, AuthClient } from "../auth/service";
import { WorkspaceAccess } from "../auth/workspace-access";
import { Billing } from "../billing/service";
import { ApiKey, ApiKeyRowId } from "../db/branded";
import * as schema from "../db/schema";
import { DbClient, query } from "../db/service";
import { maskId, safeErrorInfo } from "../log-utils";
import type { Env } from "../shared";
import {
  ConnectUnauthorizedError,
  KeyCreationError,
  NoActiveOrgError,
  SessionLookupError,
} from "./errors";
import {
  ApiKeyStore,
  SessionProvider,
  connectWorkspaceAccessError,
  getAuthorizedSession,
  requireAuthorizedSession,
} from "./services";

const authorizeExtensionKey = Effect.fn("ExtensionConnect.authorizeKey")(
  function* (apiKey: ApiKey) {
    const workspaceAccess = yield* WorkspaceAccess;
    return yield* workspaceAccess
      .authorizeApiKey(apiKey)
      .pipe(Effect.mapError(connectWorkspaceAccessError));
  }
);

// Cookie-authed mint: the web app calls this, gets the API key directly, and
// hands it to the extension over externally_connectable (no pairing code).
export const handleConnectRequest = Effect.fn(
  "ExtensionConnect.handleConnectRequest"
)(function* (headers: Headers) {
  const apiKeyStore = yield* ApiKeyStore;

  const session = yield* requireAuthorizedSession(headers);

  const { userId, orgId } = session;
  if (!orgId) {
    return yield* new NoActiveOrgError({ userId });
  }

  const result = yield* apiKeyStore.create(
    headers,
    { orgId, source: "chrome-extension" },
    "Chrome Extension"
  );

  yield* Effect.logInfo("Extension API key minted").pipe(
    Effect.annotateLogs({ userId: maskId(userId), orgId: maskId(orgId) })
  );

  return { apiKey: result.key, orgId };
});

export const handleAccountRequest = Effect.fn(
  "ExtensionConnect.handleAccountRequest"
)(function* (apiKey: ApiKey | null) {
  if (!apiKey) {
    return yield* new ConnectUnauthorizedError();
  }
  const db = yield* DbClient;
  const { orgId, userId } = yield* authorizeExtensionKey(apiKey);
  yield* Effect.annotateCurrentSpan("orgId", maskId(orgId));
  const row = yield* query(
    db
      .select({ name: schema.user.name, image: schema.user.image })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
  ).pipe(Effect.map((rows) => rows[0] ?? null));
  const billing = yield* Billing;
  const capabilities = yield* billing.capabilities(orgId);

  return {
    maxSavedLinks: capabilities.maxSavedLinks,
    user: { name: row?.name ?? null, image: row?.image ?? null },
  };
});

export const handleDisconnectRequest = Effect.fn(
  "ExtensionConnect.handleDisconnectRequest"
)(function* (apiKey: ApiKey | null) {
  if (!apiKey) {
    return yield* new ConnectUnauthorizedError();
  }
  const auth = yield* AuthClient;
  const apiKeyStore = yield* ApiKeyStore;

  yield* authorizeExtensionKey(apiKey);

  const verify = yield* Effect.tryPromise({
    catch: (cause) => new SessionLookupError({ cause }),
    try: () => auth.api.verifyApiKey({ body: { key: apiKey } }),
  });
  if (!verify.valid || !verify.key) {
    yield* Effect.logWarning("Disconnect rejected: invalid API key");
    return yield* new ConnectUnauthorizedError();
  }

  const keyRowId = ApiKeyRowId.make(verify.key.id);
  yield* Effect.annotateCurrentSpan("keyId", maskId(keyRowId));
  if (verify.key.referenceId) {
    yield* Effect.annotateCurrentSpan("userId", maskId(verify.key.referenceId));
  }

  yield* apiKeyStore.deleteById(keyRowId).pipe(
    Effect.tapError((cause) =>
      Effect.logError(
        "Extension API key revocation failed; key may still be active"
      ).pipe(
        Effect.annotateLogs({
          keyId: maskId(keyRowId),
          ...safeErrorInfo(cause),
        })
      )
    )
  );
  yield* Effect.logInfo("Extension API key revoked via disconnect").pipe(
    Effect.annotateLogs({ keyId: maskId(keyRowId) })
  );
  return { ok: true };
});

const makeLiveLayer = (env: Env) =>
  Layer.mergeAll(
    Layer.effect(
      SessionProvider,
      Effect.gen(function* () {
        const workspaceAccess = yield* WorkspaceAccess;
        return SessionProvider.of({
          getSession: (headers) =>
            getAuthorizedSession(workspaceAccess, headers),
        });
      })
    ),
    Layer.effect(
      ApiKeyStore,
      Effect.gen(function* () {
        const db = yield* DbClient;
        const auth = yield* AuthClient;
        return ApiKeyStore.of({
          listByUser: (userId) =>
            query(
              db
                .select({
                  id: schema.apikey.id,
                  metadata: schema.apikey.metadata,
                })
                .from(schema.apikey)
                .where(eq(schema.apikey.referenceId, userId))
            ).pipe(
              Effect.map((rows) =>
                rows.map((r) => ({
                  id: ApiKeyRowId.make(r.id),
                  metadata: r.metadata,
                }))
              )
            ),
          deleteById: (id) =>
            query(
              db.delete(schema.apikey).where(eq(schema.apikey.id, id))
            ).pipe(Effect.asVoid),
          create: (headers, metadata, name) =>
            Effect.tryPromise({
              try: () =>
                auth.api.createApiKey({ body: { metadata, name }, headers }),
              catch: (cause) =>
                new KeyCreationError({ reason: "auth_backend", cause }),
            }).pipe(
              Effect.flatMap((result) => {
                if (!result?.key)
                  return Effect.fail(
                    new KeyCreationError({ reason: "missing_key" })
                  );
                if (!result.id)
                  return Effect.fail(
                    new KeyCreationError({ reason: "missing_id" })
                  );
                return Effect.succeed({
                  key: ApiKey.make(result.key),
                  id: ApiKeyRowId.make(result.id),
                });
              })
            ),
          updateName: (id, name) =>
            query(
              db
                .update(schema.apikey)
                .set({ name })
                .where(eq(schema.apikey.id, id))
            ).pipe(Effect.asVoid),
        });
      })
    )
  ).pipe(Layer.provideMerge(AppLayerLive(env)));

const unexpected500 = (cause: unknown): Effect.Effect<Response> =>
  Effect.logError("Extension connect handler crashed").pipe(
    Effect.annotateLogs(safeErrorInfo(cause)),
    Effect.as(Response.json({ error: "Internal error" }, { status: 500 }))
  );

export const handleExtensionConnect = (
  request: Request,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    handleConnectRequest(request.headers).pipe(
      Effect.provide(makeLiveLayer(env)),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        ConnectUnauthorizedError: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
        KeyCreationError: (e) =>
          Effect.logError("Extension API key creation failed").pipe(
            Effect.annotateLogs({
              reason: e.reason,
              ...safeErrorInfo(e.cause),
            }),
            Effect.as(
              Response.json(
                { error: "Failed to create API key" },
                { status: 500 }
              )
            )
          ),
        NoActiveOrgError: () =>
          Effect.succeed(
            Response.json(
              { error: "No Cloudstash library is available" },
              { status: 400 }
            )
          ),
        SessionLookupError: () =>
          Effect.succeed(
            Response.json(
              { error: "Auth backend unavailable" },
              { status: 503 }
            )
          ),
      }),
      Effect.catchCause((cause) => unexpected500(cause))
    )
  );

export const handleExtensionDisconnect = (
  request: Request,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    handleDisconnectRequest(
      Option.getOrNull(bearerApiKey(request.headers))
    ).pipe(
      Effect.provide(makeLiveLayer(env)),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        ConnectUnauthorizedError: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
        SessionLookupError: () =>
          Effect.succeed(
            Response.json(
              { error: "Auth backend unavailable" },
              { status: 503 }
            )
          ),
        DbError: (e) => unexpected500(e.cause),
      }),
      Effect.catchCause((cause) => unexpected500(cause))
    )
  );

export const handleExtensionAccount = (
  request: Request,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    handleAccountRequest(Option.getOrNull(bearerApiKey(request.headers))).pipe(
      Effect.provide(makeLiveLayer(env)),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        ConnectUnauthorizedError: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
        SessionLookupError: () =>
          Effect.succeed(
            Response.json(
              { error: "Auth backend unavailable" },
              { status: 503 }
            )
          ),
        DbError: (e) => unexpected500(e.cause),
      }),
      Effect.catchCause((cause) => unexpected500(cause))
    )
  );
