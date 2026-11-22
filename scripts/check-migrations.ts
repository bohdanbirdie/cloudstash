import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { readMigrationFiles } from "drizzle-orm/migrator";
import { Schema } from "effect";

const migrationsDirectory = new URL("../drizzle/migrations/", import.meta.url);
const checksumsFile = new URL(
  "../drizzle/migration-checksums.json",
  import.meta.url
);
const customMigrationMarker = "-- Custom SQL migration file";

// This predates the custom-migration rule and cannot be changed now that it has
// shipped. New handwritten data migrations must carry Drizzle's custom marker.
const legacyDataMigrations = new Set(["20260826195054_lively_victor_mancha"]);

const containsHandwrittenDataMutation = (sql: string) => {
  const mutatesExistingRows = /^\s*(?:delete\s+from|replace\s+into|update)\b/im;
  const insertsApplicationRows = /^\s*insert\s+into\s+(?![`"]?__new_)/im;

  return mutatesExistingRows.test(sql) || insertsApplicationRows.test(sql);
};

const MigrationChecksums = Schema.Record(Schema.String, Schema.String);
type MigrationChecksums = typeof MigrationChecksums.Type;

const readRecordedChecksums = async (): Promise<MigrationChecksums> => {
  try {
    return Schema.decodeUnknownSync(MigrationChecksums)(
      JSON.parse(await readFile(checksumsFile, "utf8"))
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
};

const migrations = readMigrationFiles({
  migrationsFolder: fileURLToPath(migrationsDirectory),
});

const recordedChecksums = await readRecordedChecksums();
const currentChecksums: Record<string, string> = {};
const violations: string[] = [];

for (const { name, hash, sql: statements } of migrations) {
  const sql = statements.join("\n");
  if (sql.trimStart().startsWith(customMigrationMarker)) continue;

  currentChecksums[name] = hash;
  if (!legacyDataMigrations.has(name) && containsHandwrittenDataMutation(sql)) {
    violations.push(name);
  }
}

for (const [name, recordedChecksum] of Object.entries(recordedChecksums)) {
  if (currentChecksums[name] === undefined) {
    violations.push(`${name} (missing)`);
  } else if (currentChecksums[name] !== recordedChecksum) {
    violations.push(`${name} (changed after generation)`);
  }
}

const recordNew = process.argv.includes("--record-new");
if (recordNew && violations.length === 0) {
  const nextChecksums = { ...currentChecksums, ...recordedChecksums };
  await writeFile(
    checksumsFile,
    `${JSON.stringify(nextChecksums, null, 2)}\n`,
    "utf8"
  );
} else if (!recordNew) {
  for (const name of Object.keys(currentChecksums)) {
    if (recordedChecksums[name] === undefined) {
      violations.push(`${name} (not recorded by bun run db:generate)`);
    }
  }
}

if (violations.length > 0) {
  console.error(
    [
      "Invalid Drizzle-generated migrations:",
      ...violations.map((name) => `- ${name}`),
      "Create a separate custom migration with `bun run db:generate:custom -- --name <name>`.",
    ].join("\n")
  );
  process.exitCode = 1;
}
