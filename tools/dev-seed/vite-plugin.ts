// Seeds every empty library on the local dev server from Bohdan's links file.
// A library is created on its first /sync connection, so this watches those
// upgrades (and the Mac app's key mint, below) and runs `scripts/dev-seed.ts seed --if-empty` with the browser's
// own cookie: it works for whichever account signed in. It exists only in
// `vite serve`, never in the build that deploys.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import { loadEnv } from "vite-plus";
import type { Plugin } from "vite-plus";

export const LINKS_FILE = "local/dev-data/links.jsonl";

export const devSeedApplies = (
  command: string,
  env: Record<string, string | undefined>
) => command === "serve" && !env.VITEST && env.STORYBOOK !== "true";

type SeedConnection = {
  cookie: string;
  origin: string | undefined;
  storeId?: string;
};

export const syncConnection = (
  req: IncomingMessage
): SeedConnection | undefined => {
  const url = new URL(req.url ?? "/", "http://dev");
  const storeId = url.searchParams.get("storeId");
  const cookie = req.headers.cookie;
  if (url.pathname.replace(/\/$/, "") !== "/sync" || !storeId || !cookie) {
    return undefined;
  }
  return { cookie, origin: req.headers.origin, storeId };
};

// Cloudstash for Mac syncs with an API key, not a cookie, so a library it
// opens first is seeded when the browser mints that key for it.
export const nativeConnection = (
  req: IncomingMessage
): SeedConnection | undefined => {
  const { pathname } = new URL(req.url ?? "/", "http://dev");
  const cookie = req.headers.cookie;
  if (req.method !== "POST" || pathname !== "/api/connect/native" || !cookie) {
    return undefined;
  }
  return { cookie, origin: req.headers.origin };
};

export const devSeed = (): Plugin => ({
  apply: (_, { command }) => devSeedApplies(command, process.env),
  configureServer(server) {
    const { httpServer } = server;
    const { logger, mode, root } = server.config;
    if (!httpServer) return;
    const env = { ...loadEnv(mode, root, ""), ...process.env };
    if (env.DEV_SEED === "off") {
      logger.info("Dev seed: off (DEV_SEED=off), new libraries start empty.");
      return;
    }
    if (!existsSync(path.join(root, LINKS_FILE))) {
      logger.warn(
        `Dev seed: no ${LINKS_FILE}, new libraries start empty. Link it: ln -s ~/dev/other-projects/cloudstash-local local`
      );
      return;
    }
    logger.info(
      `Dev seed: empty libraries get the links in ${LINKS_FILE} (DEV_SEED=off to skip).`
    );
    const seeded = new Set<string>();
    const seed = (connection: SeedConnection | undefined) => {
      if (!connection) return;
      const key = connection.storeId ?? `native:${connection.cookie}`;
      if (seeded.has(key)) return;
      seeded.add(key);
      const { port } = httpServer.address() as AddressInfo;
      const base = `http://127.0.0.1:${port}`;
      const child = spawn(
        process.versions.bun ? process.execPath : "bun",
        ["scripts/dev-seed.ts", "seed", LINKS_FILE, "--if-empty"],
        {
          cwd: root,
          env: {
            ...process.env,
            BETTER_AUTH_URL: connection.origin ?? base,
            DEV_URL: base,
            SEED_COOKIE: connection.cookie,
          },
          stdio: "inherit",
        }
      );
      child.on("exit", (code) => {
        if (code !== 0) seeded.delete(key);
      });
    };
    httpServer.on("upgrade", (req: IncomingMessage) =>
      seed(syncConnection(req))
    );
    httpServer.on("request", (req: IncomingMessage) =>
      seed(nativeConnection(req))
    );
  },
  name: "cloudstash:dev-seed",
});
