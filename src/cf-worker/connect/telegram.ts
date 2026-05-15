import { and, eq, gt, like } from "drizzle-orm";
import { Effect, Layer, Schema } from "effect";

import { AppLayerLive, AuthClient } from "../auth/service";
import { OrgId, UserId } from "../db/branded";
import * as schema from "../db/schema";
import { DbClient, query } from "../db/service";
import type { Env } from "../shared";
import { TelegramBotApi, TelegramKeyStore } from "../telegram/services";
import { TelegramBotApiLive } from "../telegram/services/bot-api.live";
import { TelegramKeyStoreLive } from "../telegram/services/telegram-key-store.live";
import {
  ConnectUnauthorizedError,
  InvalidCodeError,
  KeyCreationError,
  MissingCodeError,
  NoActiveOrgError,
} from "./errors";
import {
  ApiKeyStore,
  InvalidVerificationPayloadError,
  SessionProvider,
  TelegramConnectStore,
} from "./services";

const CODE_TTL_MS = 10 * 60 * 1000;
const VERIFICATION_PREFIX = "telegram-connect:";

const TelegramVerificationPayload = Schema.Struct({
  chatId: Schema.Number,
});

export const initiateRequest = Effect.fn("TelegramConnect.initiate")(function* (
  chatId: number
) {
  yield* Effect.annotateCurrentSpan("chatId", chatId);
  const connectStore = yield* TelegramConnectStore;
  return yield* connectStore.issueCode(chatId);
});

export const initiateTelegramConnect = (
  env: Env,
  chatId: number,
  publicUrl: string
): Promise<{ code: string; url: string }> =>
  Effect.runPromise(
    initiateRequest(chatId).pipe(
      Effect.provide(makeLiveLayer(env)),
      Effect.map((code) => ({
        code,
        url: `${publicUrl}/connect/telegram?code=${code}`,
      }))
    )
  );

export const checkRequest = Effect.fn("TelegramConnect.check")(function* (
  headers: Headers,
  code: string | null
) {
  const sessionProvider = yield* SessionProvider;
  yield* sessionProvider
    .getSession(headers)
    .pipe(
      Effect.flatMap((s) =>
        s ? Effect.succeed(s) : Effect.fail(new ConnectUnauthorizedError())
      )
    );

  if (!code) return { valid: false as const };

  const connectStore = yield* TelegramConnectStore;
  const record = yield* connectStore.findByCode(code);
  return { valid: record !== null };
});

export const confirmRequest = Effect.fn("TelegramConnect.confirm")(function* (
  headers: Headers,
  body: { code?: string }
) {
  if (!body.code) return yield* Effect.fail(new MissingCodeError());

  const sessionProvider = yield* SessionProvider;
  const apiKeyStore = yield* ApiKeyStore;
  const connectStore = yield* TelegramConnectStore;
  const keyStore = yield* TelegramKeyStore;
  const botApi = yield* TelegramBotApi;

  const session = yield* sessionProvider
    .getSession(headers)
    .pipe(
      Effect.flatMap((s) =>
        s ? Effect.succeed(s) : Effect.fail(new ConnectUnauthorizedError())
      )
    );

  const { userId, orgId } = session;
  yield* Effect.annotateCurrentSpan("userId", userId);

  if (!orgId) return yield* Effect.fail(new NoActiveOrgError({ userId }));

  const record = yield* connectStore.consumeByCode(body.code);
  if (!record) return yield* Effect.fail(new InvalidCodeError());

  yield* Effect.annotateCurrentSpan("chatId", record.chatId);

  const created = yield* apiKeyStore
    .create(headers, { orgId, source: "telegram" }, "Telegram")
    .pipe(
      Effect.flatMap((r) =>
        r
          ? Effect.succeed(r)
          : Effect.fail(
              new KeyCreationError({
                cause: new Error("API key creation returned null"),
              })
            )
      )
    );

  yield* keyStore.put(record.chatId, created.key);
  yield* keyStore.linkUser(userId, record.chatId);

  yield* botApi
    .sendMessage(record.chatId, "✅ Connected! Send me any link to save it.")
    .pipe(
      Effect.catchTag("TelegramBotApiError", (error) =>
        Effect.logWarning("Telegram connect confirm: notify failed").pipe(
          Effect.annotateLogs({ op: error.op, cause: error.cause })
        )
      )
    );

  yield* Effect.logInfo("Telegram connect confirmed").pipe(
    Effect.annotateLogs({ userId, chatId: record.chatId })
  );

  return { ok: true as const };
});

export const statusRequest = Effect.fn("TelegramConnect.status")(function* (
  headers: Headers
) {
  const sessionProvider = yield* SessionProvider;
  const keyStore = yield* TelegramKeyStore;
  const botApi = yield* TelegramBotApi;

  const session = yield* sessionProvider
    .getSession(headers)
    .pipe(
      Effect.flatMap((s) =>
        s ? Effect.succeed(s) : Effect.fail(new ConnectUnauthorizedError())
      )
    );
  yield* Effect.annotateCurrentSpan("userId", session.userId);

  const chatIds = yield* keyStore.listForUser(session.userId);
  const me = yield* botApi
    .getMe()
    .pipe(
      Effect.catchTag("TelegramBotApiError", (error) =>
        Effect.logWarning("Telegram getMe failed").pipe(
          Effect.annotateLogs({ cause: error.cause }),
          Effect.as({ username: null })
        )
      )
    );

  return { count: chatIds.length, botUsername: me.username };
});

export const disconnectRequest = Effect.fn("TelegramConnect.disconnect")(
  function* (headers: Headers) {
    const sessionProvider = yield* SessionProvider;
    const apiKeyStore = yield* ApiKeyStore;
    const keyStore = yield* TelegramKeyStore;
    const botApi = yield* TelegramBotApi;

    const session = yield* sessionProvider
      .getSession(headers)
      .pipe(
        Effect.flatMap((s) =>
          s ? Effect.succeed(s) : Effect.fail(new ConnectUnauthorizedError())
        )
      );
    yield* Effect.annotateCurrentSpan("userId", session.userId);

    const chatIds = yield* keyStore.listForUser(session.userId);
    yield* Effect.annotateCurrentSpan("chatCount", chatIds.length);

    yield* Effect.forEach(
      chatIds,
      (chatId) =>
        botApi
          .sendMessage(
            chatId,
            "Disconnected from Cloudstash. Send any message to reconnect."
          )
          .pipe(
            Effect.catchTag("TelegramBotApiError", (error) =>
              Effect.logWarning("Disconnect notify failed").pipe(
                Effect.annotateLogs({ chatId, cause: error.cause })
              )
            )
          ),
      { discard: true }
    );

    yield* keyStore.purgeForUser(session.userId);

    const userKeys = yield* apiKeyStore.listByUser(session.userId);
    const telegramKeyIds = userKeys
      .filter((row) => {
        if (!row.metadata) return false;
        try {
          const parsed: unknown = JSON.parse(row.metadata);
          return (
            !!parsed &&
            typeof parsed === "object" &&
            (parsed as { source?: unknown }).source === "telegram"
          );
        } catch {
          return false;
        }
      })
      .map((row) => row.id);
    yield* Effect.annotateCurrentSpan("keyCount", telegramKeyIds.length);

    yield* Effect.forEach(telegramKeyIds, (id) => apiKeyStore.deleteById(id), {
      discard: true,
    });

    yield* Effect.logInfo("Telegram disconnect").pipe(
      Effect.annotateLogs({
        userId: session.userId,
        chatCount: chatIds.length,
        keyCount: telegramKeyIds.length,
      })
    );

    return { ok: true as const };
  }
);

const decodePayload = (identifier: string, value: string) =>
  Schema.decodeUnknown(Schema.parseJson(TelegramVerificationPayload))(
    value
  ).pipe(
    Effect.mapError(() => new InvalidVerificationPayloadError({ identifier }))
  );

const TelegramConnectStoreLive = Layer.effect(
  TelegramConnectStore,
  Effect.gen(function* () {
    const db = yield* DbClient;
    return TelegramConnectStore.of({
      issueCode: (chatId) =>
        Effect.gen(function* () {
          const now = new Date();
          const existing = yield* query(
            db
              .select()
              .from(schema.verification)
              .where(
                and(
                  like(
                    schema.verification.identifier,
                    `${VERIFICATION_PREFIX}%`
                  ),
                  eq(schema.verification.value, JSON.stringify({ chatId })),
                  gt(schema.verification.expiresAt, now)
                )
              )
              .get()
          );
          if (existing) {
            return existing.identifier.slice(VERIFICATION_PREFIX.length);
          }
          const code = crypto.randomUUID();
          yield* query(
            db.insert(schema.verification).values({
              id: crypto.randomUUID(),
              identifier: `${VERIFICATION_PREFIX}${code}`,
              value: JSON.stringify({ chatId }),
              createdAt: now,
              expiresAt: new Date(now.getTime() + CODE_TTL_MS),
              updatedAt: now,
            })
          );
          return code;
        }),
      findByCode: (code) =>
        Effect.gen(function* () {
          const identifier = `${VERIFICATION_PREFIX}${code}`;
          const row = yield* query(
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
          );
          if (!row) return null;
          const parsed = yield* decodePayload(identifier, row.value);
          return { recordId: row.id, chatId: parsed.chatId };
        }),
      consumeByCode: (code) =>
        Effect.gen(function* () {
          const identifier = `${VERIFICATION_PREFIX}${code}`;
          const rows = yield* query(
            db
              .delete(schema.verification)
              .where(
                and(
                  eq(schema.verification.identifier, identifier),
                  gt(schema.verification.expiresAt, new Date())
                )
              )
              .returning()
          );
          const row = rows[0];
          if (!row) return null;
          const parsed = yield* decodePayload(identifier, row.value);
          return { recordId: row.id, chatId: parsed.chatId };
        }),
    });
  })
);

const SessionProviderLive = Layer.effect(
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
);

const ApiKeyStoreLive = Layer.effect(
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
        query(db.delete(schema.apikey).where(eq(schema.apikey.id, id))).pipe(
          Effect.asVoid
        ),
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
          db.update(schema.apikey).set({ name }).where(eq(schema.apikey.id, id))
        ).pipe(Effect.asVoid),
    });
  })
);

const makeLiveLayer = (env: Env) =>
  Layer.mergeAll(
    SessionProviderLive,
    ApiKeyStoreLive,
    TelegramConnectStoreLive,
    TelegramKeyStoreLive(env),
    TelegramBotApiLive(env.TELEGRAM_BOT_TOKEN)
  ).pipe(Layer.provideMerge(AppLayerLive(env)));

const unexpected500 = (cause: unknown): Effect.Effect<Response> =>
  Effect.logError("Connect handler crashed").pipe(
    Effect.annotateLogs({ cause: String(cause) }),
    Effect.as(Response.json({ error: "Internal error" }, { status: 500 }))
  );

export const handleTelegramConfirm = (
  request: Request,
  env: Env
): Promise<Response> =>
  Effect.tryPromise({
    catch: (): { code?: string } => ({}),
    try: (): Promise<{ code?: string }> => request.json(),
  }).pipe(
    Effect.flatMap((body) =>
      confirmRequest(request.headers, body).pipe(
        Effect.provide(makeLiveLayer(env))
      )
    ),
    Effect.map((data) => Response.json(data)),
    Effect.catchTags({
      ConnectUnauthorizedError: () =>
        Effect.succeed(
          Response.json({ error: "Unauthorized" }, { status: 401 })
        ),
      NoActiveOrgError: () =>
        Effect.succeed(
          Response.json({ error: "No active organization" }, { status: 400 })
        ),
      MissingCodeError: () =>
        Effect.succeed(
          Response.json({ error: "Missing code" }, { status: 400 })
        ),
      InvalidCodeError: () =>
        Effect.succeed(
          Response.json({ error: "Invalid or expired code" }, { status: 400 })
        ),
      InvalidVerificationPayloadError: () =>
        Effect.succeed(
          Response.json({ error: "Invalid or expired code" }, { status: 400 })
        ),
      KeyCreationError: () =>
        Effect.succeed(
          Response.json({ error: "Failed to create API key" }, { status: 500 })
        ),
      DbError: (e) => unexpected500(e.cause),
    }),
    Effect.catchAllCause((cause) => unexpected500(cause)),
    Effect.runPromise
  );

export const handleTelegramCheck = (
  request: Request,
  env: Env
): Promise<Response> => {
  const code = new URL(request.url).searchParams.get("code");
  return Effect.runPromise(
    checkRequest(request.headers, code).pipe(
      Effect.provide(makeLiveLayer(env)),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        ConnectUnauthorizedError: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
        InvalidVerificationPayloadError: () =>
          Effect.succeed(Response.json({ valid: false })),
        DbError: (e) => unexpected500(e.cause),
      }),
      Effect.catchAllCause((cause) => unexpected500(cause))
    )
  );
};

export const handleTelegramStatus = (
  request: Request,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    statusRequest(request.headers).pipe(
      Effect.provide(makeLiveLayer(env)),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        ConnectUnauthorizedError: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
      }),
      Effect.catchAllCause((cause) => unexpected500(cause))
    )
  );

export const handleTelegramDisconnect = (
  request: Request,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    disconnectRequest(request.headers).pipe(
      Effect.provide(makeLiveLayer(env)),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        ConnectUnauthorizedError: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
      }),
      Effect.catchAllCause((cause) => unexpected500(cause))
    )
  );
