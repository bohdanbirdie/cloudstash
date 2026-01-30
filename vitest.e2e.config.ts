import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
 */
export default defineWorkersConfig({
  plugins: [viteTsConfigPaths({ projects: ["./tsconfig.json"] })],
  resolve: {
    alias: {
      // Stub mailparser to avoid Workers-incompatible dependencies in tests
      mailparser: path.resolve(__dirname, "src/cf-worker/__tests__/stubs/mailparser.ts"),
      // Stub @react-email/code-block to avoid prismjs (browser globals) in tests
      "@react-email/code-block": path.resolve(__dirname, "src/cf-worker/email/stubs/code-block.ts"),
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
    ],
  },
  test: {
    include: ["src/cf-worker/__tests__/e2e/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/readonly-llm-lookup/**"],
    poolOptions: {
      workers: {
        singleWorker: true,
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            BETTER_AUTH_SECRET: "test-secret-for-jwt-signing-32chars",
            BETTER_AUTH_URL: "http://localhost",
            GOOGLE_CLIENT_ID: "test-google-client-id",
            GOOGLE_CLIENT_SECRET: "test-google-client-secret",
            ENABLE_TEST_AUTH: "true",
            TEST_MIGRATIONS: JSON.stringify(migrations),
          },
        },
      },
    },
    setupFiles: ["src/cf-worker/__tests__/e2e/setup.ts"],
  },
});
