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
      "src/cf-worker/**/__tests__/**/*.test.ts",
      "src/components/**/__tests__/**/*.test.ts",
      "src/lib/__tests__/**/*.test.ts",
      "src/livestore/__tests__/**/*.test.ts",
      "src/stores/__tests__/**/*.test.ts",
      "tools/**/__tests__/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/local/**", "**/__tests__/e2e/**"],
    coverage: {
      include: ["src/cf-worker/**"],
      exclude: ["src/cf-worker/__tests__/**"],
    },
  },
});
