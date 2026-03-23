import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	out: "./drizzle/migrations",
	schema: "./src/cf-worker/db/schema.ts",
	dbCredentials: {
		url: ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/430ea751e114a8e6ed7efc39c43fcb9c64cccdcef1c2724145921a77fe81ebf3.sqlite",
	},
});
