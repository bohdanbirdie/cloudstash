import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "drizzle-kit";

const localD1Directory =
  ".alchemy/local/d1/cloudflare-runtime-D1DatabaseObject";

const localD1File = (
  existsSync(localD1Directory) ? readdirSync(localD1Directory) : []
).find((file) => file.endsWith(".sqlite") && file !== "metadata.sqlite");

if (!localD1File) {
  throw new Error("No local D1 database found. Run `bun dev` once first.");
}

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/cf-worker/db/schema.ts",
  dbCredentials: { url: path.join(localD1Directory, localD1File) },
});
