import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { Clock, Data, Effect, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";

import type { Env } from "../shared";
import { OtelTracingLive } from "../tracing";
import { googleEmulatorURL } from "./local-dev";

const GOOGLE_ISSUER = "https://accounts.google.com";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USER_INFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const X_USER_INFO_URL =
  "https://api.x.com/2/users/me?user.fields=username,name,profile_image_url";

const XUserInfo = Schema.Struct({
  data: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    profile_image_url: Schema.optional(Schema.String),
    username: Schema.String,
  }),
});

export class XUserInfoError extends Data.TaggedError("XUserInfoError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const getXUserInfo = Effect.fn("Auth.getXUserInfo")(function* (
  accessToken: string | undefined
) {
  if (!accessToken) {
    return yield* new XUserInfoError({ message: "X returned no access token" });
  }
  const client = yield* HttpClient.HttpClient;
  const response = yield* client
    .get(X_USER_INFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    .pipe(
      Effect.mapError(
        (cause) =>
          new XUserInfoError({ message: "X user lookup failed", cause })
      )
    );
  if (response.status < 200 || response.status >= 300) {
    return yield* new XUserInfoError({
      message: `X user lookup failed with status ${response.status}`,
    });
  }

  const json = yield* response.json.pipe(
    Effect.mapError(
      (cause) =>
        new XUserInfoError({ message: "X returned invalid JSON", cause })
    )
  );
  const body = yield* Schema.decodeUnknownEffect(XUserInfo)(json).pipe(
    Effect.catchTag("SchemaError", (cause) =>
      Effect.fail(
        new XUserInfoError({
          message: "X returned invalid user data",
          cause,
        })
      )
    )
  );
  const now = new Date(yield* Clock.currentTimeMillis);

  return {
    id: body.data.id,
    name: body.data.name,
    email: `${body.data.username}@x.local`,
    emailVerified: false,
    image: body.data.profile_image_url,
    createdAt: now,
    updatedAt: now,
  };
});

type GoogleEnv = Pick<Env, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET"> & {
  BETTER_AUTH_URL?: string;
  GOOGLE_EMULATOR_URL?: string;
};

// The emulator mints a new subject for each user every time it starts, so
// local accounts are keyed by email under an issuer of their own.
const LOCAL_GOOGLE_ISSUER = "urn:cloudstash:local-google";

const googleEmulatorConfig = (
  env: GoogleEnv,
  emulator: string
): GenericOAuthConfig<"google"> => ({
  providerId: "google",
  accountIssuer: LOCAL_GOOGLE_ISSUER,
  accountSubject: ({ profile }) => {
    if (typeof profile.email !== "string" || profile.email.length === 0) {
      throw new Error("Google emulator user info is missing an email");
    }
    return profile.email;
  },
  authorizationUrl: `${emulator}/o/oauth2/v2/auth`,
  tokenUrl: `${emulator}/oauth2/token`,
  userInfoUrl: `${emulator}/oauth2/v2/userinfo`,
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  scopes: ["openid", "email", "profile"],
  pkce: true,
  overrideUserInfo: true,
});

const googleProductionConfig = (
  env: GoogleEnv
): GenericOAuthConfig<"google"> => ({
  providerId: "google",
  accountIssuer: GOOGLE_ISSUER,
  accountSubject: ({ profile }) => {
    const subject = profile.sub;
    if (
      (typeof subject !== "string" && typeof subject !== "number") ||
      String(subject).length === 0
    ) {
      throw new Error("Google user info is missing a stable subject");
    }
    return subject;
  },
  authorizationUrl: `${GOOGLE_ISSUER}/o/oauth2/v2/auth`,
  tokenUrl: GOOGLE_TOKEN_URL,
  userInfoUrl: GOOGLE_USER_INFO_URL,
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  scopes: ["openid", "email", "profile"],
  pkce: true,
  overrideUserInfo: true,
});

const googleConfig = (env: GoogleEnv): GenericOAuthConfig<"google"> => {
  const emulator = googleEmulatorURL(env);
  return emulator
    ? googleEmulatorConfig(env, emulator)
    : googleProductionConfig(env);
};

const xConfig = (
  env: Partial<Pick<Env, "X_CLIENT_ID" | "X_CLIENT_SECRET">>
): GenericOAuthConfig<"x"> | undefined => {
  if (!env.X_CLIENT_ID || !env.X_CLIENT_SECRET) return undefined;

  return {
    providerId: "x",
    authorizationUrl: "https://x.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    clientId: env.X_CLIENT_ID,
    clientSecret: env.X_CLIENT_SECRET,
    scopes: ["bookmark.read", "tweet.read", "users.read", "offline.access"],
    pkce: true,
    authentication: "basic",
    getUserInfo: (tokens) =>
      Effect.runPromise(
        getXUserInfo(tokens.accessToken).pipe(
          Effect.provide(Layer.merge(FetchHttpClient.layer, OtelTracingLive))
        )
      ),
  };
};

export const oauthProvidersPlugin = (
  env: GoogleEnv & Partial<Pick<Env, "X_CLIENT_ID" | "X_CLIENT_SECRET">>
) => {
  const x = xConfig(env);
  return genericOAuth({ config: [googleConfig(env), ...(x ? [x] : [])] });
};
