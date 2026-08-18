import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  new URL(
    "../../../../drizzle/migrations/0015_noisy_redwing.sql",
    import.meta.url
  ),
  "utf8"
);
const migrationStatements = migrationSource
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);
const preflightSource = readFileSync(
  new URL(
    "../../../../drizzle/preflight/0015_account_issuer.sql",
    import.meta.url
  ),
  "utf8"
);

interface SqliteStatement {
  all(...parameters: ReadonlyArray<string | number | null>): unknown[];
  get(...parameters: ReadonlyArray<string | number | null>): unknown;
  run(...parameters: ReadonlyArray<string | number | null>): unknown;
}

interface SqliteDatabase {
  close(): void;
  exec(source: string): void;
  prepare(source: string): SqliteStatement;
  transaction<A>(body: () => A): () => A;
}

const createLegacyDatabase = async (
  providerIds: ReadonlyArray<string>
): Promise<SqliteDatabase> => {
  const betterSqlite3Module = "better-sqlite3";
  const { default: Database } = await import(betterSqlite3Module);
  const db = new Database(":memory:") as SqliteDatabase;

  // This is the account schema from migration 0000, which remains unchanged
  // through migration 0014.
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE user (id text PRIMARY KEY NOT NULL);
    CREATE TABLE account (
      id text PRIMARY KEY NOT NULL,
      account_id text NOT NULL,
      provider_id text NOT NULL,
      user_id text NOT NULL,
      access_token text,
      refresh_token text,
      id_token text,
      access_token_expires_at integer,
      refresh_token_expires_at integer,
      scope text,
      password text,
      created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
      updated_at integer NOT NULL,
      FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
    );
    CREATE INDEX account_userId_idx ON account (user_id);
  `);

  const insertUser = db.prepare("INSERT INTO user (id) VALUES (?)");
  const insertAccount = db.prepare(`
    INSERT INTO account
      (id, account_id, provider_id, user_id, access_token, refresh_token,
       id_token, access_token_expires_at, refresh_token_expires_at, scope,
       password, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  providerIds.forEach((providerId, index) => {
    const userId = `user-${index}`;
    insertUser.run(userId);
    insertAccount.run(
      `account-${index}`,
      "shared-subject",
      providerId,
      userId,
      `access-${index}`,
      `refresh-${index}`,
      `id-token-${index}`,
      100 + index,
      200 + index,
      `scope-${index}`,
      providerId === "credential" ? `password-${index}` : null,
      300 + index,
      400 + index
    );
  });

  return db;
};

const applyMigration = (db: SqliteDatabase): void => {
  db.transaction(() => db.exec(migrationStatements.join("\n")))();
};

const accountRows = (db: SqliteDatabase): unknown[] =>
  db.prepare("SELECT * FROM account ORDER BY id").all();

describe("Better Auth account issuer migration", () => {
  it("backfills known issuers without changing legacy account data", async () => {
    const db = await createLegacyDatabase(["credential", "google", "x"]);
    try {
      const before = accountRows(db);

      expect(db.prepare(preflightSource).all()).toEqual([]);
      applyMigration(db);

      const after = accountRows(db) as Array<Record<string, unknown>>;
      expect(after.map(({ issuer: _issuer, ...account }) => account)).toEqual(
        before
      );
      expect(
        after.map(({ issuer, provider_id: providerId }) => ({
          issuer,
          providerId,
        }))
      ).toEqual([
        { issuer: "local:credential", providerId: "credential" },
        { issuer: "https://accounts.google.com", providerId: "google" },
        { issuer: "local:oauth:x", providerId: "x" },
      ]);

      const columns = db
        .prepare("PRAGMA table_info('account')")
        .all() as Array<{
        dflt_value: string | null;
        name: string;
        notnull: number;
      }>;
      expect(columns.find((column) => column.name === "issuer")).toEqual(
        expect.objectContaining({ dflt_value: null, notnull: 1 })
      );
      expect(
        db.prepare("PRAGMA index_info('account_issuer_account_id_idx')").all()
      ).toEqual([
        expect.objectContaining({ name: "issuer", seqno: 0 }),
        expect.objectContaining({ name: "account_id", seqno: 1 }),
      ]);
      expect(() =>
        db
          .prepare(
            `INSERT INTO account
              (id, account_id, provider_id, user_id, issuer, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(
            "duplicate-account",
            "shared-subject",
            "credential-copy",
            "user-0",
            "local:credential",
            1
          )
      ).toThrow(/UNIQUE constraint failed/);

      db.prepare("DELETE FROM user WHERE id = ?").run("user-0");
      expect(db.prepare("SELECT count(*) AS count FROM account").get()).toEqual(
        { count: 2 }
      );
    } finally {
      db.close();
    }
  });

  it("reports and preserves an unsupported provider before rebuilding the table", async () => {
    const db = await createLegacyDatabase(["github"]);
    try {
      const before = accountRows(db);
      expect(db.prepare(preflightSource).all()).toEqual([
        {
          account_id: null,
          affected_rows: 1,
          issue: "unsupported_provider",
          issuer: null,
          provider_id: "github",
        },
      ]);

      expect(() => applyMigration(db)).toThrow(
        /account_issuer_provider_preflight/
      );

      expect(accountRows(db)).toEqual(before);
      expect(db.prepare("PRAGMA table_info('account')").all()).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "issuer" })])
      );
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE '__account_issuer_%' OR name = '__new_account')"
          )
          .all()
      ).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("reports and preserves duplicate identities before rebuilding the table", async () => {
    const db = await createLegacyDatabase(["credential", "credential"]);
    try {
      const before = accountRows(db);
      expect(db.prepare(preflightSource).all()).toEqual([
        {
          account_id: "shared-subject",
          affected_rows: 2,
          issue: "identity_collision",
          issuer: "local:credential",
          provider_id: "credential",
        },
      ]);

      expect(() => applyMigration(db)).toThrow(
        /account_issuer_collision_preflight/
      );

      expect(accountRows(db)).toEqual(before);
      expect(db.prepare("PRAGMA table_info('account')").all()).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "issuer" })])
      );
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE '__account_issuer_%' OR name = '__new_account')"
          )
          .all()
      ).toEqual([]);
    } finally {
      db.close();
    }
  });
});
