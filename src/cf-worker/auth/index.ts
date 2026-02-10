import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, apiKey, organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";

import { type Database } from "../db";
import * as schema from "../db/schema";
import { maskId, safeErrorInfo } from "../log-utils";
import { logSync } from "../logger";
import { type Env } from "../shared";

const logger = logSync("Auth");

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
            // Find user's first org (personal workspace) and set as active
            const membership = await db.query.member.findFirst({
              where: eq(schema.member.userId, session.userId),
            });
            return {
              data: {
                ...session,
                activeOrganizationId: membership?.organizationId ?? null,
              },
            };
          },
        },
      },
      user: {
        create: {
          after: async (user) => {
            // New users get approved: false by default (via additionalFields)
            // Just create personal workspace
            try {
              const result = await auth.api.createOrganization({
                body: {
                  name: `${user.name}'s Workspace`,
                  slug: `user-${user.id}`,
                  userId: user.id,
                },
              });
              logger.info("Created organization", {
                orgId: maskId(result?.id ?? ""),
              });
            } catch (error) {
              logger.error(
                "Failed to create organization",
                safeErrorInfo(error)
              );
              throw error;
            }
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
                // Drizzle schema handles default via mode:'json' with default({})
                // input: false means Better Auth won't validate/transform this field
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
          timeWindow: 1000 * 60 * 60 * 24, // 1 day
          maxRequests: 100,
        },
      }),
      admin({
        defaultRole: "user",
      }),
    ],
    secret: env.BETTER_AUTH_SECRET,
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 minutes — avoids D1 call on every getSession()
      },
      expiresIn: 60 * 60 * 24 * 14, // 14 days
      updateAge: 60 * 60 * 24 * 7, // 7 days - refresh after 7 days of activity
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
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
