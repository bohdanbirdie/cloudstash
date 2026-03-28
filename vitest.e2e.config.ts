import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import viteTsConfigPaths from "vite-tsconfig-paths";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load migrations in Node.js context
const migrationsDir = path.resolve(__dirname, "drizzle/migrations");
const journal = JSON.parse(
  fs.readFileSync(path.join(migrationsDir, "meta/_journal.json"), "utf8")
);
const migrations = journal.entries.map((entry: { tag: string }) => ({
  sql: fs.readFileSync(path.join(migrationsDir, `${entry.tag}.sql`), "utf8"),
  tag: entry.tag,
}));

/**
 * E2E test configuration using Cloudflare Workers Vitest pool.
 * Tests run in an isolated Workers environment with fresh D1 database.
 * Uses real vitest (not vite-plus shim) due to cloudflare pool incompatibility.
 */
export default defineWorkersConfig({
  plugins: [viteTsConfigPaths({ projects: ["./tsconfig.json"] })],
  resolve: {
    alias: {
      // Stub mailparser to avoid Workers-incompatible dependencies in tests
      mailparser: path.resolve(
        __dirname,
        "src/cf-worker/__tests__/stubs/mailparser.ts"
      ),
      // Stub @react-email/code-block to avoid prismjs (browser globals) in tests
      "@react-email/code-block": path.resolve(
        __dirname,
        "src/cf-worker/email/stubs/code-block.ts"
      ),
      // Stub ajv and ajv-formats - MCP SDK imports ajv at top level but agents uses CfWorkerJsonSchemaValidator
      // These are CJS and don't work in Workers Vitest pool
      ajv: path.resolve(__dirname, "src/cf-worker/__tests__/stubs/ajv.ts"),
      "ajv-formats": path.resolve(
        __dirname,
        "src/cf-worker/__tests__/stubs/ajv-formats.ts"
      ),
    },
  },
  ssr: {
    // Bundle these dependencies so Vite can tree-shake unused exports
    noExternal: [
      "effect",
      /@effect\//,
      /@livestore\//,
      /@opentelemetry\//,
      "resend",
      /@react-email\//,
      "agents",
      "@cloudflare/ai-chat",
      /@ai-sdk\//,
      /@modelcontextprotocol\//,
    ],
  },
  test: {
    include: ["src/cf-worker/__tests__/e2e/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/local/**"],
    poolOptions: {
      workers: {
        singleWorker: true,
        remoteBindings: false,
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            BETTER_AUTH_SECRET: "test-secret-for-jwt-signing-32chars",
            BETTER_AUTH_URL: "http://localhost",
            GOOGLE_CLIENT_ID: "test-google-client-id",
            GOOGLE_CLIENT_SECRET: "test-google-client-secret",
            ENABLE_TEST_AUTH: "true",
            RESEND_API_KEY: "re_test_dummy",
            EMAIL_FROM: "test@example.com",
            TEST_MIGRATIONS: JSON.stringify(migrations),
          },
          ratelimits: {
            SYNC_RATE_LIMITER: { simple: { limit: 10000, period: 60 } },
          },
        },
      },
    },
    setupFiles: ["src/cf-worker/__tests__/e2e/setup.ts"],
  },
});
