import fs from 'node:fs'
import path from 'node:path'
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'
import viteTsConfigPaths from 'vite-tsconfig-paths'

// Load migrations in Node.js context
const migrationsDir = path.resolve(__dirname, 'drizzle/migrations')
const journal = JSON.parse(
  fs.readFileSync(path.join(migrationsDir, 'meta/_journal.json'), 'utf-8')
)
const migrations = journal.entries.map((entry: { tag: string }) => ({
  tag: entry.tag,
  sql: fs.readFileSync(path.join(migrationsDir, `${entry.tag}.sql`), 'utf-8'),
}))

/**
 * E2E test configuration using Cloudflare Workers Vitest pool.
 * Tests run in an isolated Workers environment with fresh D1 database.
 */
export default defineWorkersConfig({
  plugins: [viteTsConfigPaths({ projects: ['./tsconfig.json'] })],
  test: {
    include: ['src/cf-worker/__tests__/e2e/**/*.test.ts'],
    setupFiles: ['src/cf-worker/__tests__/e2e/setup.ts'],
    poolOptions: {
      workers: {
        singleWorker: true,
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            BETTER_AUTH_SECRET: 'test-secret-for-jwt-signing-32chars',
            BETTER_AUTH_URL: 'http://localhost',
            GOOGLE_CLIENT_ID: 'test-google-client-id',
            GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
            ENABLE_TEST_AUTH: 'true',
            TEST_MIGRATIONS: JSON.stringify(migrations),
          },
        },
      },
    },
  },
  ssr: {
    // Bundle these dependencies so Vite can tree-shake unused exports
    noExternal: [
      'effect',
      /@effect\//,
      /@livestore\//,
      /@opentelemetry\//,
    ],
  },
})
