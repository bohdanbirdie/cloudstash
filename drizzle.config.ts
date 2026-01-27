import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  out: "./drizzle/migrations",
  schema: "./src/cf-worker/db/schema.ts",
});
