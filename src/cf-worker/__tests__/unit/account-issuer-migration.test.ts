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
      (id, account_id, provider_id, user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  providerIds.forEach((providerId, index) => {
    const userId = `user-${index}`;
    insertUser.run(userId);
    insertAccount.run(
      `account-${index}`,
      "shared-subject",
      providerId,
      userId,
      1,
      1
    );
  });

  return db;
};

const applyMigrationTransactionally = (db: SqliteDatabase): void => {
  db.transaction(() => db.exec(migrationStatements.join("\n")))();
};

const applyMigrationStatementByStatement = (db: SqliteDatabase): void => {
  for (const statement of migrationStatements) {
    db.exec(statement);
  }
};

describe("Better Auth account issuer migration", () => {
  it("backfills known issuers and enforces the final schema", async () => {
    const db = await createLegacyDatabase(["credential", "google", "x"]);
    try {
      applyMigrationTransactionally(db);

      const accounts = db
        .prepare(
          "SELECT provider_id AS providerId, issuer FROM account ORDER BY provider_id"
        )
        .all() as Array<{ issuer: string; providerId: string }>;
      expect(accounts).toEqual([
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
      const issuer = columns.find((column) => column.name === "issuer");
      expect(issuer?.notnull).toBe(1);
      expect(issuer?.dflt_value).toBeNull();

      const indexes = db
        .prepare("PRAGMA index_list('account')")
        .all() as Array<{
        name: string;
        unique: number;
      }>;
      expect(indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "account_userId_idx", unique: 0 }),
          expect.objectContaining({
            name: "account_issuer_account_id_idx",
            unique: 1,
          }),
        ])
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

  it("aborts an unknown provider without replacing the legacy table", async () => {
    const db = await createLegacyDatabase(["unknown-provider"]);
    try {
      expect(() => applyMigrationStatementByStatement(db)).toThrow(
        /NOT NULL constraint failed/
      );

      const columns = db
        .prepare("PRAGMA table_info('account')")
        .all() as Array<{
        name: string;
      }>;
      expect(columns.some((column) => column.name === "issuer")).toBe(false);
      expect(db.prepare("SELECT count(*) AS count FROM account").get()).toEqual(
        { count: 1 }
      );
      expect(
        db.prepare("SELECT provider_id AS providerId FROM account").get()
      ).toEqual({ providerId: "unknown-provider" });
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__new_account'"
          )
          .get()
      ).toEqual({ name: "__new_account" });
      expect(
        db.prepare("SELECT count(*) AS count FROM __new_account").get()
      ).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });

  it("aborts duplicate legacy identities before replacing the account table", async () => {
    const db = await createLegacyDatabase(["credential", "credential"]);
    try {
      expect(() => applyMigrationStatementByStatement(db)).toThrow(
        /UNIQUE constraint failed/
      );

      const columns = db
        .prepare("PRAGMA table_info('account')")
        .all() as Array<{
        name: string;
      }>;
      expect(columns.some((column) => column.name === "issuer")).toBe(false);
      expect(db.prepare("SELECT count(*) AS count FROM account").get()).toEqual(
        { count: 2 }
      );
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__new_account'"
          )
          .get()
      ).toEqual({ name: "__new_account" });
      expect(
        db.prepare("SELECT count(*) AS count FROM __new_account").get()
      ).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });
});
