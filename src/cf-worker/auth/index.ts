import { apiKey } from "@better-auth/api-key";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { admin, jwt, organization } from "better-auth/plugins";
import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { APIError } from "better-call";
import { Cause, Effect, Schema } from "effect";

import { ac, roles } from "@/lib/permissions";

import { prepareDeletion } from "../account-deletion/prepare";
import type { Database } from "../db";
import { UserId } from "../db/branded";
import { maskId } from "../log-utils";
import { logSync } from "../logger";
import { MCP_SCOPES, MCP_WORKSPACE_CLAIM, mcpResource } from "../mcp/config";
import { getAppLayer } from "../runtime";
import type { Env } from "../shared";
import { cloudstashAuthAdapter } from "./database-adapter";
import {
  autoApproveUser,
  resolveActiveOrg,
  startXBookmarkSyncForAccount,
} from "./hooks";
import { AppLayerLive } from "./service";

const logger = logSync("Auth");

const GOOGLE_ACCOUNT_ISSUER = "https://accounts.google.com";
const DEFAULT_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_GOOGLE_USER_INFO_URL =
  "https://openidconnect.googleapis.com/v1/userinfo";

// Note: X (Twitter) rejects `localhost` for callback URIs and requires the
// loopback IP literal `127.0.0.1` (RFC 8252). For local dev this means
// BETTER_AUTH_URL must be set to `http://127.0.0.1:3000` (not `localhost`),
// and the browser must hit the app via `127.0.0.1` so the session cookie
// is set on the same origin the X callback lands on. See .dev.vars.example.

export function oauthProvidersPlugin(
  env: Pick<
    Env,
    "GOOGLE_BASE_URL" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET"
  > &
    Partial<Pick<Env, "X_CLIENT_ID" | "X_CLIENT_SECRET">>
) {
  const googleBaseUrl = (env.GOOGLE_BASE_URL ?? GOOGLE_ACCOUNT_ISSUER).replace(
    /\/+$/,
    ""
  );
  const usesGoogleEmulator = env.GOOGLE_BASE_URL !== undefined;
  const xCredentials =
    env.X_CLIENT_ID && env.X_CLIENT_SECRET
      ? {
          clientId: env.X_CLIENT_ID,
          clientSecret: env.X_CLIENT_SECRET,
        }
      : undefined;

  return genericOAuth({
    config: [
      {
        providerId: "google",
        accountIssuer: usesGoogleEmulator
          ? googleBaseUrl
          : GOOGLE_ACCOUNT_ISSUER,
        accountSubject: ({ profile }) => {
          if (
            (typeof profile.sub !== "string" &&
              typeof profile.sub !== "number") ||
            String(profile.sub).length === 0
          ) {
            throw new Error("Google user info is missing a stable subject");
          }
          return profile.sub;
        },
        authorizationUrl: `${googleBaseUrl}/o/oauth2/v2/auth`,
        tokenUrl: usesGoogleEmulator
          ? `${googleBaseUrl}/oauth2/token`
          : DEFAULT_GOOGLE_TOKEN_URL,
        userInfoUrl: usesGoogleEmulator
          ? `${googleBaseUrl}/oauth2/v2/userinfo`
          : DEFAULT_GOOGLE_USER_INFO_URL,
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        scopes: ["openid", "email", "profile"],
        pkce: true,
        overrideUserInfo: true,
      },
      ...(xCredentials
        ? [
            {
              providerId: "x" as const,
              authorizationUrl: "https://twitter.com/i/oauth2/authorize",
              tokenUrl: "https://api.twitter.com/2/oauth2/token",
              ...xCredentials,
              scopes: [
                "bookmark.read",
                "tweet.read",
                "users.read",
                "offline.access",
              ],
              pkce: true,
              // X requires HTTP Basic Auth for confidential clients on its
              // token + refresh endpoints; body-based credentials get 401'd.
              authentication: "basic" as const,
              getUserInfo: async (tokens) => {
                const resp = await fetch(
                  "https://api.twitter.com/2/users/me?user.fields=username,name,profile_image_url",
                  {
                    headers: { Authorization: `Bearer ${tokens.accessToken}` },
                  }
                );
                if (!resp.ok) {
                  throw new Error(`X getUserInfo failed: ${resp.status}`);
                }
                const data = (await resp.json()) as {
                  data: {
                    id: string;
                    username: string;
                    name: string;
                    profile_image_url?: string;
                  };
                };
                return {
                  id: data.data.id,
                  name: data.data.name,
                  // X doesn't expose email by default; synthetic placeholder so
                  // Better Auth's User shape is satisfied. The linking flow does
                  // not overwrite the primary user's email.
                  email: `${data.data.username}@x.local`,
                  emailVerified: false,
                  image: data.data.profile_image_url,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
              },
            } satisfies GenericOAuthConfig<"x">,
          ]
        : []),
    ],
  });
}

export const createAuth = (env: Env, db: Database) => {
  const resource = mcpResource(env);
  const auth = betterAuth({
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        // Permit linking OAuth accounts whose email differs from the primary
        // user. Required for the X integration: X doesn't expose email by
        // default, so our getUserInfo synthesizes `<username>@x.local`, which
        // will never match the user's Google email. Linking only runs from an
        // already-authenticated session, so the security risk is minimal.
        allowDifferentEmails: true,
      },
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
    baseURL: env.BETTER_AUTH_URL,
    database: cloudstashAuthAdapter(db, resource),
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser) => {
            const userId = UserId.make(createdUser.id);
            await Effect.runPromise(
              autoApproveUser(userId).pipe(
                Effect.catchCause((cause) =>
                  Effect.logError("signup auto-approve failed").pipe(
                    Effect.annotateLogs({
                      userId: maskId(userId),
                      cause: Cause.pretty(cause),
                    })
                  )
                ),
                Effect.withSpan("Auth.user.create.after"),
                Effect.provide(getAppLayer(env))
              )
            );
          },
        },
      },
      account: {
        create: {
          after: async (account) => {
            await Effect.runPromise(
              startXBookmarkSyncForAccount(
                account,
                env.X_BOOKMARK_SYNC_DO
              ).pipe(
                Effect.catchCause((cause) =>
                  Effect.logError("x-link: post-link setup failed").pipe(
                    Effect.annotateLogs({
                      userId: maskId(account.userId),
                      cause: Cause.pretty(cause),
                    })
                  )
                ),
                Effect.withSpan("Auth.account.create.after"),
                Effect.provide(getAppLayer(env))
              )
            );
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const activeOrganizationId = await Effect.runPromise(
              resolveActiveOrg(session, {
                // Explicit return type breaks the self-referential inference
                // cycle (auth → before → resolveActiveOrg → this arrow → auth).
                createOrganization: (
                  body
                ): Promise<{ id: string } | null | undefined> =>
                  auth.api.createOrganization({ body }),
              }).pipe(
                Effect.withSpan("Auth.session.create.before", {
                  attributes: { userId: maskId(session.userId) },
                }),
                Effect.provide(getAppLayer(env))
              )
            );

            return { data: { ...session, activeOrganizationId } };
          },
        },
      },
    },
    emailAndPassword:
      env.ENABLE_TEST_AUTH === "true" ? { enabled: true } : undefined,
    plugins: [
      jwt(),
      mcp({
        accessTokenExpiresIn: 5 * 60,
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationRequirePKCE: true,
        consentPage: "/oauth-consent",
        customAccessTokenClaims: ({ referenceId }) =>
          referenceId ? { [MCP_WORKSPACE_CLAIM]: referenceId } : {},
        grantTypes: ["authorization_code", "refresh_token"],
        loginPage: "/login",
        postLogin: {
          page: "/oauth-consent",
          shouldRedirect: () => false,
          consentReferenceId: ({ session, scopes }) => {
            const hasWorkspaceScope = scopes.some((scope) =>
              scope.startsWith("links:")
            );
            if (!hasWorkspaceScope) return undefined;
            const activeOrganizationId = session.activeOrganizationId as
              | string
              | undefined;
            if (!activeOrganizationId) {
              throw new APIError("BAD_REQUEST", {
                error: "set_organization",
                error_description:
                  "An active workspace is required for Cloudstash link scopes",
              });
            }
            return activeOrganizationId;
          },
        },
        rateLimit: {
          register: { max: 5, window: 60 },
        },
        resource,
        scopes: [...MCP_SCOPES],
      }),
      organization({
        allowUserToCreateOrganization: true,
        creatorRole: "owner",
        schema: {
          organization: {
            additionalFields: {
              features: {
                type: "string",
                input: false,
              },
            },
          },
        },
      }),
      apiKey({
        defaultPrefix: "lb",
        enableMetadata: true,
        rateLimit: {
          enabled: false,
        },
      }),
      admin({
        ac,
        roles,
        adminRoles: ["admin"],
        defaultRole: "user",
      }),
      oauthProvidersPlugin(env),
    ],
    secret: env.BETTER_AUTH_SECRET,
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24 * 7,
    },
    user: {
      additionalFields: {
        approved: {
          defaultValue: false,
          input: false,
          required: false,
          type: "boolean",
        },
      },
      deleteUser: {
        enabled: true,
        // No `sendDeleteAccountVerification` defined → route falls through to
        // the freshAge gate (24h default). Our type-DELETE UI is the user-facing
        // confirmation. See research lock-in #1.
        beforeDelete: async (user) => {
          // Phase 1 — synchronous, fail-loud. Throwing aborts the deletion entirely.
          // Async cleanup runs in the AccountDeletionWorkflow.
          await Effect.runPromise(
            Schema.decodeUnknownEffect(UserId)(user.id).pipe(
              Effect.flatMap((userId) => prepareDeletion({ userId })),
              Effect.tapCause((cause) =>
                Effect.logError("Account deletion Phase 1 failed").pipe(
                  Effect.annotateLogs({
                    userId: maskId(user.id),
                    cause: Cause.pretty(cause),
                  })
                )
              ),
              Effect.withSpan("Auth.beforeDelete", {
                attributes: { userId: maskId(user.id) },
              }),
              Effect.provide(AppLayerLive(env))
            )
          );
        },
        afterDelete: async (user) => {
          logger.info("user deleted", { userId: maskId(user.id) });
        },
      },
    },
  });

  return auth;
};

export type Auth = ReturnType<typeof createAuth>;
