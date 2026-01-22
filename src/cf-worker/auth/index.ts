import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { jwt, organization } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import type { Database } from '../db'
import * as schema from '../db/schema'
import type { Env } from '../shared'

export const createAuth = (env: Env, db: Database) => {
  const auth = betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
    }),
    emailAndPassword: env.ENABLE_TEST_AUTH === 'true' ? { enabled: true } : undefined,
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [
      jwt({
        jwks: {
          keyPairConfig: {
            alg: 'EdDSA',
            crv: 'Ed25519',
          },
        },
        jwt: {
          issuer: env.BETTER_AUTH_URL,
          audience: env.BETTER_AUTH_URL,
          expirationTime: '1h',
          definePayload: async ({ user, session }) => ({
            sub: user.id,
            email: user.email,
            orgId: session.activeOrganizationId,
          }),
        },
      }),
      organization({
        allowUserToCreateOrganization: true,
        creatorRole: 'owner',
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            try {
              // Create personal workspace using Better Auth API
              const result = await auth.api.createOrganization({
                body: {
                  name: `${user.name}'s Workspace`,
                  slug: `user-${user.id}`,
                  userId: user.id,
                },
              })
              console.log('[user.create.after] Created organization:', result)
            } catch (error) {
              console.error('[user.create.after] Failed to create organization:', error)
              throw error
            }
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            // Find user's first org (personal workspace) and set as active
            const membership = await db.query.member.findFirst({
              where: eq(schema.member.userId, session.userId),
            })
            return {
              data: {
                ...session,
                activeOrganizationId: membership?.organizationId ?? null,
              },
            }
          },
        },
      },
    },
  })

  return auth
}

export type Auth = ReturnType<typeof createAuth>
