import { env } from 'cloudflare:test'
import { beforeAll } from 'vitest'

beforeAll(async () => {
  const db = env.DB
  const migrations: Array<{ tag: string; sql: string }> = JSON.parse(
    env.TEST_MIGRATIONS as string
  )

  for (const { sql } of migrations) {
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim()
      if (trimmed) {
        await db.prepare(trimmed).run()
      }
    }
  }

  console.log('Database migrations applied successfully')
})
