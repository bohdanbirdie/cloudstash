import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";

const migrationsDirectory = new URL("../drizzle/migrations/", import.meta.url);
const checksumsFile = new URL(
  "../drizzle/migrations/meta/generated-migration-checksums.json",
  import.meta.url
);
const customMigrationMarker = "-- Custom SQL migration file";

// This predates the custom-migration rule and cannot be changed now that it has
// shipped. New handwritten data migrations must carry Drizzle's custom marker.
const legacyDataMigrations = new Set(["0016_lively_victor_mancha.sql"]);

const containsHandwrittenDataMutation = (sql: string) => {
  const mutatesExistingRows = /^\s*(?:delete\s+from|replace\s+into|update)\b/im;
  const insertsApplicationRows = /^\s*insert\s+into\s+(?![`"]?__new_)/im;

  return mutatesExistingRows.test(sql) || insertsApplicationRows.test(sql);
};

const checksum = (sql: string) =>
  createHash("sha256").update(sql).digest("hex");

const readRecordedChecksums = async (): Promise<Record<string, string>> => {
  try {
    return JSON.parse(await readFile(checksumsFile, "utf8")) as Record<
      string,
      string
    >;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
};

const migrationNames = (await readdir(migrationsDirectory))
  .filter((name) => name.endsWith(".sql"))
  .toSorted();

const recordedChecksums = await readRecordedChecksums();
const currentChecksums: Record<string, string> = {};
const violations: string[] = [];

for (const name of migrationNames) {
  const sql = await readFile(new URL(name, migrationsDirectory), "utf8");
  const isCustomMigration = sql.trimStart().startsWith(customMigrationMarker);

  if (isCustomMigration) continue;

  currentChecksums[name] = checksum(sql);
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
