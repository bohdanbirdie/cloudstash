import { gzipSync } from "node:zlib";

import { BunRuntime, BunServices } from "@effect/platform-bun";
import {
  Console,
  Data,
  Effect,
  FileSystem,
  Path,
  Runtime,
  Schema,
} from "effect";

const maxWorkerGzipKiB = 2_700;
const maxWorkerRawKiB = 64 * 1_024;

const PackageJson = Schema.fromJsonString(
  Schema.Struct({ dependencies: Schema.Struct({ react: Schema.String }) })
);

class BundleVerificationFailed extends Data.TaggedError(
  "BundleVerificationFailed"
) {
  readonly [Runtime.errorReported] = false;
}

const countOccurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* path.fromFileUrl(new URL("..", import.meta.url));
  const workerBundlePath = path.join(root, "dist/ssr/index.js");
  const clientAssetsDir = path.join(root, "dist/client/assets");

  if (!(yield* fs.exists(workerBundlePath))) {
    yield* Console.error(
      `verify-bundle: missing ${workerBundlePath} — run bun run build first`
    );
    return yield* new BundleVerificationFailed();
  }

  const failures: string[] = [];
  const check = Effect.fnUntraced(function* (
    label: string,
    ok: boolean,
    detail: string
  ) {
    yield* Console.log(`${ok ? "ok" : "FAIL"}  ${label} (${detail})`);
    if (!ok) failures.push(label);
  });

  const workerDir = path.dirname(workerBundlePath);
  const workerFiles = yield* fs.readDirectory(workerDir, { recursive: true });
  const worker = (yield* Effect.forEach(
    workerFiles.filter((file) => file.endsWith(".js")),
    (file) => fs.readFileString(path.join(workerDir, file))
  )).join("\n");
  yield* check(
    "no effect v3 in worker bundle",
    countOccurrences(worker, "3.21.2") === 0,
    `"3.21.2" x${countOccurrences(worker, "3.21.2")}, expected x0`
  );

  yield* check(
    "SchemaBinary RPC runtime present",
    countOccurrences(
      worker,
      "SchemaBinary RPC serialization did not produce bytes"
    ) >= 1,
    `RPC serialization marker x${countOccurrences(worker, "SchemaBinary RPC serialization did not produce bytes")}, expected >=1`
  );

  yield* check(
    "no legacy msgpackr runtime",
    countOccurrences(worker, "Source must be a Uint8Array or Buffer") === 0,
    `legacy runtime marker x${countOccurrences(worker, "Source must be a Uint8Array or Buffer")}, expected x0`
  );

  yield* check(
    "no msgpackr-extract native binding",
    countOccurrences(worker, "msgpackr-extract") === 0,
    `"msgpackr-extract" x${countOccurrences(worker, "msgpackr-extract")}, expected x0`
  );

  const reactVersion = (yield* fs
    .readFileString(path.join(root, "package.json"))
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(PackageJson)))).dependencies
    .react;
  const reactMajor = reactVersion.split(".")[0];
  const versionPattern = new RegExp(`\\b${reactMajor}\\.\\d+\\.\\d+\\b`, "g");
  const distinctReactVersions = new Set<string>();
  for (const file of yield* fs.readDirectory(clientAssetsDir)) {
    if (!file.endsWith(".js")) continue;
    const source = yield* fs.readFileString(path.join(clientAssetsDir, file));
    for (const match of source.match(versionPattern) ?? []) {
      distinctReactVersions.add(match);
    }
  }
  yield* check(
    "react singleton in client bundle",
    distinctReactVersions.size === 1 && distinctReactVersions.has(reactVersion),
    `react-major version strings: [${[...distinctReactVersions].join(", ")}], expected exactly [${reactVersion}]`
  );

  const workerBytes = yield* Effect.forEach(
    workerFiles.filter(
      (file) => file.endsWith(".js") || file.endsWith(".wasm")
    ),
    (file) => fs.readFile(path.join(workerDir, file))
  );
  const rawKiB =
    workerBytes.reduce((total, bytes) => total + bytes.length, 0) / 1_024;
  const gzipKiB =
    workerBytes.reduce((total, bytes) => total + gzipSync(bytes).length, 0) /
    1_024;
  yield* check(
    "Worker raw upload budget",
    rawKiB <= maxWorkerRawKiB,
    `${rawKiB.toFixed(2)} KiB <= ${maxWorkerRawKiB} KiB`
  );
  yield* check(
    "Worker gzip upload budget",
    gzipKiB <= maxWorkerGzipKiB,
    `${gzipKiB.toFixed(2)} KiB <= ${maxWorkerGzipKiB} KiB`
  );

  if (failures.length > 0) {
    yield* Console.error(
      `verify-bundle: ${failures.length} assertion(s) failed`
    );
    return yield* new BundleVerificationFailed();
  }
  yield* Console.log("verify-bundle: all assertions passed");
});

BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
