import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../../drizzle/migrations/0014_sparkling_thor_girl.sql",
    import.meta.url
  ),
  "utf8"
).replaceAll("--> statement-breakpoint", "");

describe("MCP token account-deletion cascade", () => {
  it("deletes linked OAuth tokens without a foreign-key ordering failure", async () => {
    const bunSqliteModule = "bun:sqlite";
    const { Database } = await import(bunSqliteModule);
    const db = new Database(":memory:");
    try {
      db.exec("PRAGMA foreign_keys = ON");
      db.exec(`
        CREATE TABLE user (id text PRIMARY KEY NOT NULL);
        CREATE TABLE session (
          id text PRIMARY KEY NOT NULL,
          user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE
        );
        CREATE TABLE jwks (
          id text PRIMARY KEY NOT NULL,
          public_key text NOT NULL,
          private_key text NOT NULL,
          created_at integer NOT NULL
        );
      `);
      db.exec(migration);

      db.query("INSERT INTO user (id) VALUES (?)").run("user-1");
      db.query("INSERT INTO session (id, user_id) VALUES (?, ?)").run(
        "session-1",
        "user-1"
      );
      db.query(
        `INSERT INTO oauth_client
          (id, client_id, user_id, redirect_uris)
         VALUES (?, ?, ?, ?)`
      ).run("client-row-1", "client-1", "user-1", "[]");
      db.query(
        `INSERT INTO oauth_resource (id, identifier, name)
         VALUES (?, ?, ?)`
      ).run("resource-row-1", "https://cloudstash.test/mcp", "Cloudstash");
      db.query(
        `INSERT INTO oauth_client_resource
          (id, client_id, resource_id)
         VALUES (?, ?, ?)`
      ).run("link-1", "client-1", "https://cloudstash.test/mcp");
      db.query(
        `INSERT INTO oauth_refresh_token
          (id, token, client_id, session_id, user_id, expires_at, created_at, scopes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "refresh-1",
        "refresh-token-1",
        "client-1",
        "session-1",
        "user-1",
        2,
        1,
        '["links:read"]'
      );
      db.query(
        `INSERT INTO oauth_access_token
          (id, token, client_id, session_id, user_id, refresh_id, expires_at, created_at, scopes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "access-1",
        "access-token-1",
        "client-1",
        "session-1",
        "user-1",
        "refresh-1",
        2,
        1,
        '["links:read"]'
      );
      db.query(
        `INSERT INTO oauth_consent
          (id, client_id, user_id, scopes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run("consent-1", "client-1", "user-1", '["links:read"]', 1, 1);

      const deleteUser = db.transaction(() =>
        db.query("DELETE FROM user WHERE id = ?").run("user-1")
      );
      expect(deleteUser).not.toThrow();

      for (const table of [
        "oauth_access_token",
        "oauth_refresh_token",
        "oauth_consent",
        "oauth_client_resource",
        "oauth_client",
      ]) {
        const row = db
          .query(`SELECT count(*) AS count FROM ${table}`)
          .get() as { count: number };
        expect(row.count, table).toBe(0);
      }
    } finally {
      db.close();
    }
  });
});
