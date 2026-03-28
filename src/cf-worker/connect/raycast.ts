import { and, eq, gt } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { AppLayerLive, AuthClient } from "../auth/service";
import * as schema from "../db/schema";
import { DbClient, query } from "../db/service";
import { logSync } from "../logger";
import type { Env } from "../shared";
import {
  InvalidCodeError,
  KeyCreationError,
  MissingCodeError,
  NoActiveOrgError,
  UnauthorizedError,
} from "./errors";
import { ApiKeyStore, SessionProvider, VerificationStore } from "./services";

const logger = logSync("RaycastConnect");

export const handleConnectRequest = (headers: Headers) =>
  Effect.gen(function* () {
    const sessionProvider = yield* SessionProvider;
    const apiKeyStore = yield* ApiKeyStore;
    const verificationStore = yield* VerificationStore;

    const session = yield* sessionProvider
      .getSession(headers)
      .pipe(
        Effect.flatMap((s) =>
          s ? Effect.succeed(s) : Effect.fail(new UnauthorizedError())
        )
      );

    const { userId, orgId } = session;
    if (!orgId) {
      return yield* new NoActiveOrgError();
    }

    const result = yield* apiKeyStore
      .create(headers, { orgId, source: "raycast" }, "Raycast Extension")
      .pipe(
        Effect.flatMap((r) =>
          r ? Effect.succeed(r) : Effect.fail(new KeyCreationError())
        )
      );

    const code = crypto.randomUUID();

    yield* verificationStore.save(
      `raycast-connect:${code}`,
      { key: result.key, keyId: result.id },
      60_000
    );

    logger.info("Raycast connect code created", { userId });

    return { code };
  });

export const handleExchangeRequest = (body: {
  code?: string;
  deviceName?: string;
}) =>
  Effect.gen(function* () {
    const apiKeyStore = yield* ApiKeyStore;
    const verificationStore = yield* VerificationStore;

    if (!body.code) {
      return yield* new MissingCodeError();
    }

    const identifier = `raycast-connect:${body.code}`;

    const record = yield* verificationStore.findValid(identifier);

    if (!record) {
      return yield* new InvalidCodeError();
    }

    yield* verificationStore.deleteById(record.id);

    const { key, keyId } = record.data;

    if (body.deviceName) {
      yield* apiKeyStore.updateName(keyId, `Raycast — ${body.deviceName}`);
    }

    logger.info("Raycast connect code exchanged");

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
            Effect.tryPromise(() => auth.api.getSession({ headers })).pipe(
              Effect.orElseSucceed(() => null),
              Effect.map((session) =>
                session?.session
                  ? {
                      userId: session.user.id,
                      orgId: session.session.activeOrganizationId ?? null,
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
            ),
          deleteById: (id) =>
            query(
              db.delete(schema.apikey).where(eq(schema.apikey.id, id))
            ).pipe(Effect.asVoid),
          create: (headers, metadata, name) =>
            Effect.tryPromise(() =>
              auth.api.createApiKey({ body: { metadata, name }, headers })
            ).pipe(
              Effect.map((result) =>
                result?.key && result?.id
                  ? { key: result.key, id: result.id }
                  : null
              ),
              Effect.orElseSucceed(() => null)
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
          findValid: (identifier) =>
            query(
              db
                .select()
                .from(schema.verification)
                .where(
                  and(
                    eq(schema.verification.identifier, identifier),
                    gt(schema.verification.expiresAt, new Date())
                  )
                )
                .get()
            ).pipe(
              Effect.map((r) =>
                r ? { id: r.id, data: JSON.parse(r.value) } : null
              )
            ),
          deleteById: (id) =>
            query(
              db
                .delete(schema.verification)
                .where(eq(schema.verification.id, id))
            ).pipe(Effect.asVoid),
        });
      })
    )
  ).pipe(Layer.provide(AppLayerLive(env)));

export const handleRaycastConnect = (
  request: Request,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    handleConnectRequest(request.headers).pipe(
      Effect.provide(makeLiveLayer(env)),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
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
        UnauthorizedError: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
      })
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
      MissingCodeError: () =>
        Effect.succeed(
          Response.json({ error: "Missing code" }, { status: 400 })
        ),
    }),
    Effect.runPromise
  );
