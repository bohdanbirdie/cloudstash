import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/cf-worker/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
})
