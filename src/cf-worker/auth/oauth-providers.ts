import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { Clock, Data, Effect, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";

import type { Env } from "../shared";
import { OtelTracingLive } from "../tracing";

const GOOGLE_ISSUER = "https://accounts.google.com";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USER_INFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const X_USER_INFO_URL =
  "https://api.twitter.com/2/users/me?user.fields=username,name,profile_image_url";

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

const googleConfig = (
  env: Pick<
    Env,
    "GOOGLE_BASE_URL" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET"
  >
): GenericOAuthConfig<"google"> => {
  const baseUrl = (env.GOOGLE_BASE_URL ?? GOOGLE_ISSUER).replace(/\/+$/, "");
  const emulated = env.GOOGLE_BASE_URL !== undefined;

  return {
    providerId: "google",
    accountIssuer: emulated ? baseUrl : GOOGLE_ISSUER,
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
    authorizationUrl: `${baseUrl}/o/oauth2/v2/auth`,
    tokenUrl: emulated ? `${baseUrl}/oauth2/token` : GOOGLE_TOKEN_URL,
    userInfoUrl: emulated
      ? `${baseUrl}/oauth2/v2/userinfo`
      : GOOGLE_USER_INFO_URL,
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    scopes: ["openid", "email", "profile"],
    pkce: true,
    overrideUserInfo: true,
  };
};

const xConfig = (
  env: Partial<Pick<Env, "X_CLIENT_ID" | "X_CLIENT_SECRET">>
): GenericOAuthConfig<"x"> | undefined => {
  if (!env.X_CLIENT_ID || !env.X_CLIENT_SECRET) return undefined;

  return {
    providerId: "x",
    authorizationUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
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
  env: Pick<
    Env,
    "GOOGLE_BASE_URL" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET"
  > &
    Partial<Pick<Env, "X_CLIENT_ID" | "X_CLIENT_SECRET">>
) => {
  const x = xConfig(env);
  return genericOAuth({ config: [googleConfig(env), ...(x ? [x] : [])] });
};
