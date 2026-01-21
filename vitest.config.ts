import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    include: ['src/cf-worker/__tests__/**/*.test.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            BETTER_AUTH_SECRET: 'test-secret-for-jwt-signing-32chars',
            BETTER_AUTH_URL: 'http://localhost',
            GOOGLE_CLIENT_ID: 'test-google-client-id',
            GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
          },
        },
      },
    },
  },
})
