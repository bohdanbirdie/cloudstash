import { defineConfig } from "vitest/config";

/**
 * Unit test configuration using standard Vitest.
 * Fast tests that don't require the Workers runtime.
 */
export default defineConfig({
  test: {
    include: ["src/cf-worker/__tests__/unit/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/readonly-llm-lookup/**"],
  },
});
