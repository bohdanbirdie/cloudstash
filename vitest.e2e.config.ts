import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

import {
  livestoreBuildDefine,
  livestoreLocalResolve,
} from "./tools/livestore-local.ts";

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
 * E2E test configuration using the Cloudflare Vitest plugin.
 * Tests run in an isolated Workers environment with fresh D1 database.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      remoteBindings: false,
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        queueConsumers: {
          "cloudstash-x-reconcile": {
            maxBatchSize: 10,
            maxBatchTimeout: 0.05,
            maxRetries: 5,
          },
        },
        bindings: {
          BETTER_AUTH_SECRET: "test-secret-for-jwt-signing-32chars",
          BETTER_AUTH_URL: "http://localhost",
          GOOGLE_CLIENT_ID: "test-google-client-id",
          GOOGLE_CLIENT_SECRET: "test-google-client-secret",
          X_CLIENT_ID: "test-x-client-id",
          X_CLIENT_SECRET: "test-x-client-secret",
          ENABLE_TEST_AUTH: "true",
          RESEND_API_KEY: "re_test_dummy",
          EMAIL_FROM: "test@example.com",
          STRIPE_API_KEY: "sk_test_delete",
          STRIPE_PRICE_PLUS: "price_plus",
          STRIPE_PRICE_PLUS_YEARLY: "price_plus_yearly",
          STRIPE_PRICE_PRO: "price_pro",
          STRIPE_PRICE_PRO_YEARLY: "price_pro_yearly",
          TEST_MIGRATIONS: JSON.stringify(migrations),
        },
        ratelimits: {
          METADATA_RATE_LIMITER: {
            namespace_id: "1002",
            simple: { limit: 10000, period: 60 },
          },
          SYNC_RATE_LIMITER: {
            namespace_id: "1001",
            simple: { limit: 10000, period: 60 },
          },
        },
      },
    }),
  ],
  define: livestoreBuildDefine(),
  resolve: {
    tsconfigPaths: true,
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
    // Background DO fibers (livestore push, link processing) keep logging after
    // a file's last test; vitest's console-intercept RPC then races environment
    // teardown ("Closing rpc while onUserConsoleLog was pending") and fails CI.
    disableConsoleIntercept: true,
    setupFiles: ["src/cf-worker/__tests__/e2e/setup.ts"],
  },
});
