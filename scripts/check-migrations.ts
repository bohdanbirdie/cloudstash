import { BunRuntime, BunServices } from "@effect/platform-bun";
import { readMigrationFiles } from "drizzle-orm/migrator";
import {
  Console,
  Data,
  Effect,
  FileSystem,
  Path,
  Runtime,
  Schema,
} from "effect";

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

class InvalidMigrations extends Data.TaggedError("InvalidMigrations") {
  readonly [Runtime.errorReported] = false;
}

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const migrationsDirectory = yield* path.fromFileUrl(
    new URL("../drizzle/migrations/", import.meta.url)
  );
  const checksumsFile = yield* path.fromFileUrl(
    new URL("../drizzle/migration-checksums.json", import.meta.url)
  );

  const recordedChecksums = yield* fs.readFileString(checksumsFile).pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(Schema.fromJsonString(MigrationChecksums))
    ),
    Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed({}))
  );

  const migrations = readMigrationFiles({
    migrationsFolder: migrationsDirectory,
  });

  const currentChecksums: Record<string, string> = {};
  const violations: string[] = [];

  for (const { name, hash, sql: statements } of migrations) {
    const sql = statements.join("\n");
    if (sql.trimStart().startsWith(customMigrationMarker)) continue;

    currentChecksums[name] = hash;
    if (
      !legacyDataMigrations.has(name) &&
      containsHandwrittenDataMutation(sql)
    ) {
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
    yield* fs.writeFileString(
      checksumsFile,
      `${JSON.stringify(nextChecksums, null, 2)}\n`
    );
  } else if (!recordNew) {
    for (const name of Object.keys(currentChecksums)) {
      if (recordedChecksums[name] === undefined) {
        violations.push(`${name} (not recorded by bun run db:generate)`);
      }
    }
  }

  if (violations.length > 0) {
    yield* Console.error(
      [
        "Invalid Drizzle-generated migrations:",
        ...violations.map((name) => `- ${name}`),
        "Create a separate custom migration with `bun run db:generate:custom -- --name <name>`.",
      ].join("\n")
    );
    return yield* new InvalidMigrations();
  }
});

BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
