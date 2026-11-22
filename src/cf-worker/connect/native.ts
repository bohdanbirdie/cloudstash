import { eq } from "drizzle-orm";
import { Effect, Option, Schema } from "effect";

import { isNativeCodeChallenge } from "@/lib/native-redirect";

import { bearerApiKey } from "../auth/bearer-api-key";
import { WorkspaceAccess } from "../auth/workspace-access";
import type { ApiKey } from "../db/branded";
import * as schema from "../db/schema";
import { DbClient, query } from "../db/service";
import { maskId, safeErrorInfo } from "../log-utils";
import type { Env } from "../shared";
import {
  ConnectUnauthorizedError,
  InvalidCodeError,
  MissingCodeError,
  NoActiveOrgError,
} from "./errors";
import { makeLiveLayer } from "./raycast";
import {
  ApiKeyStore,
  VerificationStore,
  connectWorkspaceAccessError,
  requireAuthorizedSession,
} from "./services";

const KEY_NAME = "Cloudstash for Mac";
const CODE_TTL_MS = 60_000;

const NativeConnectBody = Schema.Struct({
  codeChallenge: Schema.optional(Schema.String),
});
const NativeExchangeBody = Schema.Struct({
  code: Schema.optional(Schema.String),
  codeVerifier: Schema.optional(Schema.String),
  deviceName: Schema.optional(Schema.String),
});
const decodeConnectBody = Schema.decodeUnknownEffect(NativeConnectBody);
const decodeExchangeBody = Schema.decodeUnknownEffect(NativeExchangeBody);

// The code is only redeemable together with the verifier behind its challenge,
// so the pair is stored as one identifier and consumed atomically.
const codeIdentifier = (code: string, codeChallenge: string) =>
  `native-connect:${code}:${codeChallenge}`;

const challengeOf = (codeVerifier: string) =>
  Effect.promise(async () => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(codeVerifier)
    );
    return btoa(String.fromCodePoint(...new Uint8Array(digest)))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
  });

// Cookie-authed mint: the signed-in web page calls this with the app's PKCE
// challenge and hands the resulting one-time code to the app's loopback
// listener. The key itself never passes through the browser.
export const handleConnectRequest = Effect.fn(
  "NativeConnect.handleConnectRequest"
)(function* (headers: Headers, body: typeof NativeConnectBody.Type) {
  const apiKeyStore = yield* ApiKeyStore;
  const verificationStore = yield* VerificationStore;

  const { userId, orgId } = yield* requireAuthorizedSession(headers);
  if (!orgId) {
    return yield* new NoActiveOrgError({ userId });
  }
  const codeChallenge = body.codeChallenge ?? null;
  if (!isNativeCodeChallenge(codeChallenge)) {
    return yield* new MissingCodeError();
  }

  const result = yield* apiKeyStore.create(
    headers,
    { orgId, source: "native" },
    KEY_NAME
  );
  const code = crypto.randomUUID();
  yield* verificationStore.save(
    codeIdentifier(code, codeChallenge),
    { key: result.key, keyId: result.id },
    CODE_TTL_MS
  );

  yield* Effect.logInfo("Native connect code created").pipe(
    Effect.annotateLogs({ userId: maskId(userId), orgId: maskId(orgId) })
  );

  return { code };
});

export const handleExchangeRequest = Effect.fn(
  "NativeConnect.handleExchangeRequest"
)(function* (body: typeof NativeExchangeBody.Type) {
  const apiKeyStore = yield* ApiKeyStore;
  const verificationStore = yield* VerificationStore;
  const workspaceAccess = yield* WorkspaceAccess;

  if (!body.code || !body.codeVerifier) {
    return yield* new MissingCodeError();
  }

  const codeChallenge = yield* challengeOf(body.codeVerifier);
  const record = yield* verificationStore.consumeByIdentifier(
    codeIdentifier(body.code, codeChallenge)
  );
  if (!record) {
    return yield* new InvalidCodeError();
  }

  const { key, keyId } = record.data;
  yield* workspaceAccess
    .authorizeApiKey(key)
    .pipe(Effect.mapError(connectWorkspaceAccessError));

  const deviceName = body.deviceName?.trim().slice(0, 64);
  if (deviceName) {
    yield* apiKeyStore.updateName(keyId, `${KEY_NAME} — ${deviceName}`);
  }

  yield* Effect.logInfo("Native connect code exchanged");

  return { apiKey: key };
});

export const handleAccountRequest = Effect.fn(
  "NativeConnect.handleAccountRequest"
)(function* (apiKey: ApiKey | null) {
  if (!apiKey) {
    return yield* new ConnectUnauthorizedError();
  }
  const workspaceAccess = yield* WorkspaceAccess;
  const db = yield* DbClient;
  const { orgId, userId } = yield* workspaceAccess
    .authorizeApiKey(apiKey)
    .pipe(Effect.mapError(connectWorkspaceAccessError));
  const row = yield* query(
    db
      .select({ email: schema.user.email, name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
  ).pipe(Effect.map((rows) => rows[0] ?? null));
  if (!row) {
    return yield* new ConnectUnauthorizedError();
  }

  return { orgId, user: { email: row.email, name: row.name } };
});

const json = (body: unknown, status: number) =>
  Effect.succeed(Response.json(body, { status }));

const unexpected500 = (cause: unknown): Effect.Effect<Response> =>
  Effect.logError("Native connect handler crashed").pipe(
    Effect.annotateLogs(safeErrorInfo(cause)),
    Effect.as(Response.json({ error: "Internal error" }, { status: 500 }))
  );

const readBody = (request: Request) =>
  Effect.tryPromise({
    catch: () => ({}),
    try: () => request.json<unknown>(),
  }).pipe(Effect.catch(() => Effect.succeed({})));

export const handleNativeConnect = (
  request: Request,
  env: Env
): Promise<Response> =>
  readBody(request).pipe(
    Effect.flatMap(decodeConnectBody),
    Effect.catch(() => Effect.succeed({})),
    Effect.flatMap((body) => handleConnectRequest(request.headers, body)),
    Effect.provide(makeLiveLayer(env)),
    Effect.map((data) => Response.json(data)),
    Effect.catchTags({
      ConnectUnauthorizedError: () => json({ error: "Unauthorized" }, 401),
      KeyCreationError: () => json({ error: "Failed to create API key" }, 500),
      MissingCodeError: () => json({ error: "Invalid code challenge" }, 400),
      NoActiveOrgError: () =>
        json({ error: "No Cloudstash library is available" }, 400),
      SessionLookupError: () =>
        json({ error: "Auth backend unavailable" }, 503),
      DbError: (e) => unexpected500(e.cause),
    }),
    Effect.catchCause((cause) => unexpected500(cause)),
    Effect.runPromise
  );

export const handleNativeExchange = (
  request: Request,
  env: Env
): Promise<Response> =>
  readBody(request).pipe(
    Effect.flatMap(decodeExchangeBody),
    Effect.catch(() => Effect.succeed({})),
    Effect.flatMap((body) => handleExchangeRequest(body)),
    Effect.provide(makeLiveLayer(env)),
    Effect.map((data) => Response.json(data)),
    Effect.catchTags({
      ConnectUnauthorizedError: () => json({ error: "Unauthorized" }, 401),
      InvalidCodeError: () => json({ error: "Invalid or expired code" }, 400),
      InvalidVerificationPayloadError: () =>
        json({ error: "Invalid or expired code" }, 400),
      MissingCodeError: () => json({ error: "Missing code" }, 400),
      SessionLookupError: () =>
        json({ error: "Auth backend unavailable" }, 503),
      DbError: (e) => unexpected500(e.cause),
    }),
    Effect.catchCause((cause) => unexpected500(cause)),
    Effect.runPromise
  );

export const handleNativeAccount = (
  request: Request,
  env: Env
): Promise<Response> =>
  handleAccountRequest(Option.getOrNull(bearerApiKey(request.headers))).pipe(
    Effect.provide(makeLiveLayer(env)),
    Effect.map((data) => Response.json(data)),
    Effect.catchTags({
      ConnectUnauthorizedError: () => json({ error: "Unauthorized" }, 401),
      SessionLookupError: () =>
        json({ error: "Auth backend unavailable" }, 503),
      DbError: (e) => unexpected500(e.cause),
    }),
    Effect.catchCause((cause) => unexpected500(cause)),
    Effect.runPromise
  );
