import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { eq } from "drizzle-orm";

import type { Database } from "../db";
import * as schema from "../db/schema";
import { maskId, safeErrorInfo } from "../log-utils";
import { logSync } from "../logger";
import type { Env } from "../shared";

const logger = logSync("Auth");

const DEFAULT_GOOGLE_BASE_URL = "https://accounts.google.com";

function googleOAuthPlugin(env: Env) {
  const baseUrl = env.GOOGLE_BASE_URL ?? DEFAULT_GOOGLE_BASE_URL;

  return genericOAuth({
    config: [
      {
        providerId: "google",
        discoveryUrl: `${baseUrl}/.well-known/openid-configuration`,
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        scopes: ["openid", "email", "profile"],
        pkce: true,
      },
    ],
  });
}

export const createAuth = (env: Env, db: Database) => {
  const auth = betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            // Check if user already has an org
            let membership = await db.query.member.findFirst({
              where: eq(schema.member.userId, session.userId),
            });

            // First session for this user — create their personal workspace
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
                    slug: `user-${session.userId}`,
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
      googleOAuthPlugin(env),
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
    },
  });

  return auth;
};

export type Auth = ReturnType<typeof createAuth>;
