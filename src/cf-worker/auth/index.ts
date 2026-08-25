import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, jwt, organization } from "better-auth/plugins";
import { Cause, Effect, Schema } from "effect";

import { ac, roles } from "@/lib/permissions";

import { prepareDeletion } from "../account-deletion/prepare";
import type { Database } from "../db";
import { UserId } from "../db/branded";
import * as schema from "../db/schema";
import { maskId } from "../log-utils";
import { logSync } from "../logger";
import { getAppLayer } from "../runtime";
import type { Env } from "../shared";
import {
  autoApproveUser,
  resolveActiveOrg,
  startXBookmarkSyncForAccount,
} from "./hooks";
import { mcpPlugin } from "./mcp-plugin";
import { oauthProvidersPlugin } from "./oauth-providers";
import { AppLayerLive } from "./service";

const logger = logSync("Auth");

// Note: X (Twitter) rejects `localhost` for callback URIs and requires the
// loopback IP literal `127.0.0.1` (RFC 8252). For local dev this means
// BETTER_AUTH_URL must be set to `http://127.0.0.1:3000` (not `localhost`),
// and the browser must hit the app via `127.0.0.1` so the session cookie
// is set on the same origin the X callback lands on. See .dev.vars.example.

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
        trustedProviders: ["x"],
      },
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
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
      mcpPlugin(env),
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
