import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { eq } from "drizzle-orm";
import { Cause, Effect, Schema } from "effect";

import { personalOrgSlug, prepareDeletion } from "../account-deletion/prepare";
import type { Database } from "../db";
import { UserId } from "../db/branded";
import * as schema from "../db/schema";
import { maskId, safeErrorInfo } from "../log-utils";
import { logSync } from "../logger";
import type { Env } from "../shared";
import { AppLayerLive } from "./service";

const logger = logSync("Auth");

const DEFAULT_GOOGLE_BASE_URL = "https://accounts.google.com";

// Note: X (Twitter) rejects `localhost` for callback URIs and requires the
// loopback IP literal `127.0.0.1` (RFC 8252). For local dev this means
// BETTER_AUTH_URL must be set to `http://127.0.0.1:3000` (not `localhost`),
// and the browser must hit the app via `127.0.0.1` so the session cookie
// is set on the same origin the X callback lands on. See .dev.vars.example.

function oauthProvidersPlugin(env: Env) {
  const googleBaseUrl = env.GOOGLE_BASE_URL ?? DEFAULT_GOOGLE_BASE_URL;

  return genericOAuth({
    config: [
      {
        providerId: "google",
        discoveryUrl: `${googleBaseUrl}/.well-known/openid-configuration`,
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        scopes: ["openid", "email", "profile"],
        pkce: true,
        overrideUserInfo: true,
      },
      {
        providerId: "x",
        authorizationUrl: "https://twitter.com/i/oauth2/authorize",
        tokenUrl: "https://api.twitter.com/2/oauth2/token",
        clientId: env.X_CLIENT_ID,
        clientSecret: env.X_CLIENT_SECRET,
        scopes: ["bookmark.read", "tweet.read", "users.read", "offline.access"],
        pkce: true,
        // X requires HTTP Basic Auth for confidential clients on its
        // token + refresh endpoints; body-based credentials get 401'd.
        authentication: "basic",
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
      },
    ],
  });
}

export const createAuth = (env: Env, db: Database) => {
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
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    databaseHooks: {
      account: {
        create: {
          after: async (account) => {
            if (account.providerId !== "x") return;
            try {
              // DO.start() fetches /users/me, persists identity in its own
              // storage, pins watermark to current head (cost safety: no
              // backfill of existing bookmarks), and arms the alarm.
              const stub = env.X_BOOKMARK_SYNC_DO.get(
                env.X_BOOKMARK_SYNC_DO.idFromName(account.userId)
              );
              await stub.start();

              logger.info("x-link: DO started", {
                userId: maskId(account.userId),
              });
            } catch (error) {
              logger.error("x-link: post-link setup failed", {
                ...safeErrorInfo(error),
                userId: maskId(account.userId),
              });
            }
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            let membership = await db.query.member.findFirst({
              where: eq(schema.member.userId, session.userId),
            });

            if (!membership) {
              try {
                const user = await db.query.user.findFirst({
                  where: eq(schema.user.id, session.userId),
                });
                const orgName = user?.name
                  ? `${user.name}'s Workspace`
                  : "My Workspace";
                const org = await auth.api.createOrganization({
                  body: {
                    name: orgName,
                    slug: personalOrgSlug(UserId.make(session.userId)),
                    userId: session.userId,
                  },
                });
                logger.info("Created organization", {
                  orgId: maskId(org?.id ?? ""),
                });
                membership = await db.query.member.findFirst({
                  where: eq(schema.member.userId, session.userId),
                });
              } catch (error) {
                logger.error(
                  "Failed to create organization",
                  safeErrorInfo(error)
                );
                // Re-fetch in case a concurrent first-session race lost on
                // the unique-slug constraint — the winner's member row is
                // already there and we'd otherwise return null.
                membership = await db.query.member.findFirst({
                  where: eq(schema.member.userId, session.userId),
                });
              }
            }

            return {
              data: {
                ...session,
                activeOrganizationId: membership?.organizationId ?? null,
              },
            };
          },
        },
      },
    },
    emailAndPassword:
      env.ENABLE_TEST_AUTH === "true" ? { enabled: true } : undefined,
    plugins: [
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
          enabled: true,
          timeWindow: 1000 * 60 * 60 * 24,
          maxRequests: 100,
        },
      }),
      admin({
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
            Schema.decodeUnknown(UserId)(user.id).pipe(
              Effect.flatMap((userId) => prepareDeletion({ userId })),
              Effect.tapErrorCause((cause) =>
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
