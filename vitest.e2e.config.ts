import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

import { livestoreLocalResolve } from "./tools/livestore-local.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const livestoreLocal = livestoreLocalResolve();

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
export default defineConfig({
  plugins: [
    cloudflareTest({
      remoteBindings: false,
      wrangler: { configPath: "./wrangler.jsonc" },
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
    }),
    viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
  ],
  resolve: {
    dedupe: livestoreLocal.dedupe,
    alias: [
      // Stub mailparser to avoid Workers-incompatible dependencies in tests
      {
        find: "mailparser",
        replacement: path.resolve(
          __dirname,
          "src/cf-worker/__tests__/stubs/mailparser.ts"
        ),
      },
      // Stub @react-email/code-block to avoid prismjs (browser globals) in tests
      {
        find: "@react-email/code-block",
        replacement: path.resolve(
          __dirname,
          "src/cf-worker/email/stubs/code-block.ts"
        ),
      },
      // Stub ajv and ajv-formats - MCP SDK imports ajv at top level but agents uses CfWorkerJsonSchemaValidator
      // These are CJS and don't work in Workers Vitest pool
      {
        find: "ajv",
        replacement: path.resolve(
          __dirname,
          "src/cf-worker/__tests__/stubs/ajv.ts"
        ),
      },
      {
        find: "ajv-formats",
        replacement: path.resolve(
          __dirname,
          "src/cf-worker/__tests__/stubs/ajv-formats.ts"
        ),
      },
      {
        find: "defuddle/node",
        replacement: path.resolve(
          __dirname,
          "src/cf-worker/__tests__/stubs/defuddle-node.ts"
        ),
      },
      // When LIVESTORE_LOCAL=1, redirect @livestore/* to local clone source
      ...livestoreLocal.alias,
    ],
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
    exclude: ["**/node_modules/**", "**/local/**", "**/vendor/**"],
    // CI runners are noticeably slower than local at warming miniflare —
    // workflow + DO tests that finish in <500ms here time out at 5s on CI.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ["src/cf-worker/__tests__/e2e/setup.ts"],
  },
});
