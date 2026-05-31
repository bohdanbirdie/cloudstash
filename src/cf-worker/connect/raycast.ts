import { and, eq, gt } from "drizzle-orm";
import { Effect, Layer, Schema } from "effect";

import { AppLayerLive, AuthClient } from "../auth/service";
import { capabilityDeniedResponse } from "../billing/errors";
import { requireCapability } from "../billing/service";
import { ApiKey, ApiKeyRowId, OrgId, UserId } from "../db/branded";
import * as schema from "../db/schema";
import { DbClient, query } from "../db/service";
import { maskId, safeErrorInfo } from "../log-utils";
import type { Env } from "../shared";
import {
  ConnectUnauthorizedError,
  InvalidCodeError,
  KeyCreationError,
  MissingCodeError,
  NoActiveOrgError,
  SessionLookupError,
} from "./errors";
import {
  ApiKeyStore,
  InvalidVerificationPayloadError,
  SessionProvider,
  VerificationData,
  VerificationStore,
} from "./services";

const decodeVerificationData = Schema.decodeUnknown(VerificationData);

export const handleConnectRequest = Effect.fn(
  "RaycastConnect.handleConnectRequest"
)(function* (headers: Headers) {
  const sessionProvider = yield* SessionProvider;
  const apiKeyStore = yield* ApiKeyStore;
  const verificationStore = yield* VerificationStore;

  const session = yield* sessionProvider
    .getSession(headers)
    .pipe(
      Effect.flatMap((s) =>
        s ? Effect.succeed(s) : Effect.fail(new ConnectUnauthorizedError())
      )
    );

  const { userId, orgId } = session;
  if (!orgId) {
    return yield* new NoActiveOrgError({ userId });
  }

  yield* requireCapability(orgId, "integrations");

  const result = yield* apiKeyStore.create(
    headers,
    { orgId, source: "raycast" },
    "Raycast Extension"
  );

  const code = crypto.randomUUID();

  yield* verificationStore.save(
    `raycast-connect:${code}`,
    { key: result.key, keyId: result.id },
    60_000
  );

  yield* Effect.logInfo("Raycast connect code created").pipe(
    Effect.annotateLogs({ userId: maskId(userId) })
  );

  return { code };
});

export const handleExchangeRequest = Effect.fn(
  "RaycastConnect.handleExchangeRequest"
)(function* (body: { code?: string; deviceName?: string }) {
  const apiKeyStore = yield* ApiKeyStore;
  const verificationStore = yield* VerificationStore;

  if (!body.code) {
    return yield* new MissingCodeError();
  }

  const identifier = `raycast-connect:${body.code}`;

  const record = yield* verificationStore.consumeByIdentifier(identifier);

  if (!record) {
    return yield* new InvalidCodeError();
  }

  const { key, keyId } = record.data;

  if (body.deviceName) {
    yield* apiKeyStore.updateName(keyId, `Raycast — ${body.deviceName}`);
  }

  yield* Effect.logInfo("Raycast connect code exchanged");

  return { apiKey: key };
});

const makeLiveLayer = (env: Env) =>
  Layer.mergeAll(
    Layer.effect(
      SessionProvider,
      Effect.gen(function* () {
        const auth = yield* AuthClient;
        return SessionProvider.of({
          getSession: (headers) =>
            Effect.tryPromise({
              catch: (cause) => new SessionLookupError({ cause }),
              try: () => auth.api.getSession({ headers }),
            }).pipe(
              Effect.map((session) =>
                session?.session
                  ? {
                      userId: UserId.make(session.user.id),
                      orgId: session.session.activeOrganizationId
                        ? OrgId.make(session.session.activeOrganizationId)
                        : null,
                    }
                  : null
              )
            ),
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
    ),
    Layer.effect(
      VerificationStore,
      Effect.gen(function* () {
        const db = yield* DbClient;
        return VerificationStore.of({
          save: (identifier, data, ttlMs) => {
            const now = new Date();
            return query(
              db.insert(schema.verification).values({
                id: crypto.randomUUID(),
                identifier,
                value: JSON.stringify(data),
                createdAt: now,
                expiresAt: new Date(now.getTime() + ttlMs),
                updatedAt: now,
              })
            ).pipe(Effect.asVoid);
          },
          consumeByIdentifier: (identifier) =>
            query(
              db
                .delete(schema.verification)
                .where(
                  and(
                    eq(schema.verification.identifier, identifier),
                    gt(schema.verification.expiresAt, new Date())
                  )
                )
                .returning()
            ).pipe(
              Effect.flatMap((rows) => {
                const r = rows[0];
                if (!r) return Effect.succeed(null);
                return Effect.try({
                  try: () => JSON.parse(r.value) as unknown,
                  catch: () =>
                    new InvalidVerificationPayloadError({ identifier }),
                }).pipe(
                  Effect.flatMap((parsed) =>
                    decodeVerificationData(parsed).pipe(
                      Effect.mapError(
                        () =>
                          new InvalidVerificationPayloadError({ identifier })
                      ),
                      Effect.map((data) => ({ id: r.id, data }))
                    )
                  )
                );
              })
            ),
        });
      })
    )
  ).pipe(Layer.provideMerge(AppLayerLive(env)));

const unexpected500 = (cause: unknown): Effect.Effect<Response> =>
  Effect.logError("Raycast handler crashed").pipe(
    Effect.annotateLogs(safeErrorInfo(cause)),
    Effect.as(Response.json({ error: "Internal error" }, { status: 500 }))
  );

export const handleRaycastConnect = (
  request: Request,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    handleConnectRequest(request.headers).pipe(
      Effect.provide(makeLiveLayer(env)),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        CapabilityDisabledError: (e) =>
          Effect.succeed(capabilityDeniedResponse(e)),
        ConnectUnauthorizedError: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
        KeyCreationError: () =>
          Effect.succeed(
            Response.json(
              { error: "Failed to create API key" },
              { status: 500 }
            )
          ),
        NoActiveOrgError: () =>
          Effect.succeed(
            Response.json({ error: "No active organization" }, { status: 400 })
          ),
        OrgNotFoundError: () =>
          Effect.succeed(
            Response.json({ error: "Organization not found" }, { status: 404 })
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
      Effect.catchAllCause((cause) => unexpected500(cause))
    )
  );

export const handleRaycastExchange = (
  request: Request,
  env: Env
): Promise<Response> =>
  Effect.tryPromise({
    catch: (): { code?: string } => ({}),
    try: (): Promise<{ code?: string; deviceName?: string }> => request.json(),
  }).pipe(
    Effect.flatMap((body) =>
      handleExchangeRequest(body).pipe(Effect.provide(makeLiveLayer(env)))
    ),
    Effect.map((data) => Response.json(data)),
    Effect.catchTags({
      InvalidCodeError: () =>
        Effect.succeed(
          Response.json({ error: "Invalid or expired code" }, { status: 400 })
        ),
      InvalidVerificationPayloadError: () =>
        Effect.succeed(
          Response.json({ error: "Invalid or expired code" }, { status: 400 })
        ),
      MissingCodeError: () =>
        Effect.succeed(
          Response.json({ error: "Missing code" }, { status: 400 })
        ),
      DbError: (e) => unexpected500(e.cause),
    }),
    Effect.catchAllCause((cause) => unexpected500(cause)),
    Effect.runPromise
  );
