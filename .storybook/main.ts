import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { StorybookConfig } from "@storybook/react-vite";
import type { Plugin } from "vite";

// Dev-only: browser downloads land on the host (Storybook runs in a VM),
// so the Open Graph story POSTs its PNG here to write public/ directly.
const brandAssetSink: Plugin = {
  name: "cloudstash-brand-asset-sink",
  configureServer(server) {
    server.middlewares.use("/__brand/save-og", (req, res) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end();
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        void writeFile(
          join(process.cwd(), "public", "cloudstash-og.png"),
          Buffer.concat(chunks)
        ).then(
          () => {
            res.statusCode = 204;
            res.end();
          },
          (error: unknown) => {
            res.statusCode = 500;
            res.end(String(error));
          }
        );
      });
    });
  },
};

const config: StorybookConfig = {
  stories: ["../src/**/*.story.@(ts|tsx)"],
  staticDirs: ["../public"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: (viteConfig) => {
    viteConfig.plugins = [...(viteConfig.plugins ?? []), brandAssetSink];
    return viteConfig;
  },
};

export default config;
