import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { defineConfig } from "vitest/config";

import { localWorkerOptions } from "./tools/local-worker";
import type { CallerSuppliedBindings } from "./tools/local-worker";
import { WORKER_COMPATIBILITY, WORKER_MAIN } from "./worker.config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const migrations = readMigrationFiles({
  migrationsFolder: path.resolve(__dirname, "drizzle/migrations"),
}).map(({ name, sql }) => ({ name, sql }));

const localWorker = localWorkerOptions("./dist/client");

const testBindings = {
  // Synthetic test-only private limit; production values stay in secrets.
  AI_METER_LIMIT: "1",
  BETTER_AUTH_SECRET: "test-secret-for-jwt-signing-32chars",
  BETTER_AUTH_URL: "http://localhost",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  X_CLIENT_ID: "test-x-client-id",
  X_CLIENT_SECRET: "test-x-client-secret",
  ENABLE_TEST_AUTH: "true",
  RESEND_API_KEY: "re_test_dummy",
  // Provider tests intercept the outbound request, but the SDK validates
  // its key before calling fetch. Keep CI independent from real secrets.
  OPENROUTER_API_KEY: "test-openrouter-api-key",
  STRIPE_API_KEY: "sk_test_delete",
  STRIPE_PRICE_PLUS: "price_plus",
  STRIPE_PRICE_PLUS_YEARLY: "price_plus_yearly",
  STRIPE_PRICE_PRO: "price_pro",
  STRIPE_PRICE_PRO_YEARLY: "price_pro_yearly",
  CF_ACCOUNT_ID: "",
  CF_ANALYTICS_TOKEN: "",
  GOOGLE_EMULATOR_URL: "",
  PUBLIC_URL: "",
  STRIPE_WEBHOOK_SECRET: "",
  TELEGRAM_BOT_TOKEN: "",
  TELEGRAM_WEBHOOK_SECRET: "",
} satisfies CallerSuppliedBindings;

/**
 * E2E test configuration using the Cloudflare Vitest plugin.
 * Tests run in an isolated Workers environment with fresh D1 database.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: WORKER_MAIN,
      remoteBindings: false,
      miniflare: {
        ...localWorker,
        // The vitest pool cannot load its own modules under new_module_registry.
        compatibilityFlags: WORKER_COMPATIBILITY.flags,
        modulesRules: [
          { type: "CompiledWasm", include: ["**/*.wasm"], fallthrough: true },
        ],
        queueConsumers: {
          ...localWorker.queueConsumers,
          "cloudstash-x-reconcile": {
            ...localWorker.queueConsumers["cloudstash-x-reconcile"],
            maxBatchTimeout: 0.05,
          },
        },
        bindings: {
          ...localWorker.bindings,
          ...testBindings,
          EMAIL_FROM: "test@example.com",
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
  resolve: {
    tsconfigPaths: true,
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
