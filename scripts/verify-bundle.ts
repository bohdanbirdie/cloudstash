import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const workerBundlePath = path.join(root, "dist/ssr/index.js");
const clientAssetsDir = path.join(root, "dist/client/assets");
const maxWorkerGzipKiB = 2_700;
const maxWorkerRawKiB = 64 * 1_024;

const failures: string[] = [];
const check = (label: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "ok" : "FAIL"}  ${label} (${detail})`);
  if (!ok) failures.push(label);
};

const countOccurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

if (!existsSync(workerBundlePath)) {
  console.error(
    `verify-bundle: missing ${workerBundlePath} — run bun run build first`
  );
  process.exit(1);
}

const workerDir = path.dirname(workerBundlePath);
const worker = readdirSync(workerDir, { recursive: true })
  .map(String)
  .filter((file) => file.endsWith(".js"))
  .map((file) => readFileSync(path.join(workerDir, file), "utf8"))
  .join("\n");
check(
  "no effect v3 in worker bundle",
  countOccurrences(worker, "3.21.2") === 0,
  `"3.21.2" x${countOccurrences(worker, "3.21.2")}, expected x0`
);

check(
  "SchemaBinary RPC runtime present",
  countOccurrences(
    worker,
    "SchemaBinary RPC serialization did not produce bytes"
  ) >= 1,
  `RPC serialization marker x${countOccurrences(worker, "SchemaBinary RPC serialization did not produce bytes")}, expected >=1`
);

check(
  "no legacy msgpackr runtime",
  countOccurrences(worker, "Source must be a Uint8Array or Buffer") === 0,
  `legacy runtime marker x${countOccurrences(worker, "Source must be a Uint8Array or Buffer")}, expected x0`
);

check(
  "no msgpackr-extract native binding",
  countOccurrences(worker, "msgpackr-extract") === 0,
  `"msgpackr-extract" x${countOccurrences(worker, "msgpackr-extract")}, expected x0`
);

const reactVersion: string = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8")
).dependencies.react;
const reactMajor = reactVersion.split(".")[0];
const versionPattern = new RegExp(`\\b${reactMajor}\\.\\d+\\.\\d+\\b`, "g");
const distinctReactVersions = new Set<string>();
for (const file of readdirSync(clientAssetsDir)) {
  if (!file.endsWith(".js")) continue;
  const source = readFileSync(path.join(clientAssetsDir, file), "utf8");
  for (const match of source.match(versionPattern) ?? []) {
    distinctReactVersions.add(match);
  }
}
check(
  "react singleton in client bundle",
  distinctReactVersions.size === 1 && distinctReactVersions.has(reactVersion),
  `react-major version strings: [${[...distinctReactVersions].join(", ")}], expected exactly [${reactVersion}]`
);

const workerBytes = readdirSync(workerDir, { recursive: true })
  .map(String)
  .filter((file) => file.endsWith(".js") || file.endsWith(".wasm"))
  .map((file) => readFileSync(path.join(workerDir, file)));
const rawKiB =
  workerBytes.reduce((total, bytes) => total + bytes.length, 0) / 1_024;
const gzipKiB =
  workerBytes.reduce((total, bytes) => total + gzipSync(bytes).length, 0) /
  1_024;
check(
  "Worker raw upload budget",
  rawKiB <= maxWorkerRawKiB,
  `${rawKiB.toFixed(2)} KiB <= ${maxWorkerRawKiB} KiB`
);
check(
  "Worker gzip upload budget",
  gzipKiB <= maxWorkerGzipKiB,
  `${gzipKiB.toFixed(2)} KiB <= ${maxWorkerGzipKiB} KiB`
);

if (failures.length > 0) {
  console.error(`verify-bundle: ${failures.length} assertion(s) failed`);
  process.exit(1);
}
console.log("verify-bundle: all assertions passed");
