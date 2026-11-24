import { defineConfig } from "vitest/config";

/**
 * Unit test configuration using standard Vitest.
 * Fast tests that don't require the Workers runtime.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    deps: {
      interopDefault: false,
    },
    include: [
      "src/cf-worker/**/__tests__/**/*.test.ts",
      "src/components/**/__tests__/**/*.test.ts",
      "src/components/**/__tests__/**/*.test.tsx",
      "src/lib/__tests__/**/*.test.ts",
      "src/livestore/__tests__/**/*.test.ts",
      "src/stores/__tests__/**/*.test.ts",
      "tools/**/__tests__/**/*.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/local/**",
      "**/vendor/**",
      "**/__tests__/e2e/**",
    ],
    coverage: {
      include: ["src/cf-worker/**"],
      exclude: ["src/cf-worker/__tests__/**"],
    },
  },
});
