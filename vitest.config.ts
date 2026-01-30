import viteTsConfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * Unit test configuration using standard Vitest.
 * Fast tests that don't require the Workers runtime.
 */
export default defineConfig({
  plugins: [viteTsConfigPaths({ projects: ["./tsconfig.json"] })],
  test: {
    include: [
      "src/cf-worker/__tests__/unit/**/*.test.ts",
      "src/lib/__tests__/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/readonly-llm-lookup/**"],
  },
});
