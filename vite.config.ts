import { cloudflare } from "@cloudflare/vite-plugin";
import { livestoreDevtoolsPlugin } from "@livestore/devtools-vite";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  resolve: {
    alias: {
      // Stub @react-email/code-block to avoid prismjs (browser-only) in Workers
      "@react-email/code-block": path.resolve(
        __dirname,
        "src/cf-worker/email/stubs/code-block.ts"
      ),
    },
  },
  optimizeDeps: {
    // TODO remove once fixed https://github.com/vitejs/vite/issues/8427
    exclude: ["@livestore/wa-sqlite"],
  },
  plugins: [
    cloudflare(),
    TanStackRouterVite(),
    viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    viteReact(),
    livestoreDevtoolsPlugin({ schemaPath: "./src/livestore/schema.ts" }),
  ],
  server: {
    allowedHosts: [".trycloudflare.com"],
    fs: { strict: false },
    port: Number(process.env.PORT) || 3000,
  },
  worker: {
    format: "es",
  },
});
