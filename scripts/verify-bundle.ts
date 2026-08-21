import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { livestoreBuildValue } from "../tools/livestore-local.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const workerBundlePath = path.join(root, "dist/cloudstash/index.js");
const workerConfigPath = path.join(root, "dist/cloudstash/wrangler.json");
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

const requireFromEffect = createRequire(
  createRequire(import.meta.url).resolve("effect")
);
const msgpackrEntry = requireFromEffect.resolve("msgpackr");
const msgpackrSourcePath = path.resolve(
  path.dirname(msgpackrEntry),
  "..",
  "unpack.js"
);
const msgpackrSource = readFileSync(msgpackrSourcePath, "utf8");

if (!existsSync(workerBundlePath)) {
  console.error(
    `verify-bundle: missing ${workerBundlePath} — run vp build first`
  );
  process.exit(1);
}

const worker = readFileSync(workerBundlePath, "utf8");
const expectedMarker = livestoreBuildValue();
const markerLiteralCount = (
  worker.match(
    new RegExp(
      `["'\`]${expectedMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`,
      "g"
    )
  ) ?? []
).length;

check(
  "livestore build marker",
  markerLiteralCount === 1,
  `quoted "${expectedMarker}" x${markerLiteralCount}, expected x1`
);

if (expectedMarker === "published") {
  check(
    "no vendored marker in published build",
    countOccurrences(worker, "vendored@") === 0,
    `"vendored@" x${countOccurrences(worker, "vendored@")}, expected x0`
  );
}

check(
  "no effect v3 in worker bundle",
  countOccurrences(worker, "3.21.2") === 0,
  `"3.21.2" x${countOccurrences(worker, "3.21.2")}, expected x0`
);

check(
  "msgpackr runtime present",
  countOccurrences(worker, "Source must be a Uint8Array or Buffer") >= 1,
  `stable runtime marker x${countOccurrences(worker, "Source must be a Uint8Array or Buffer")}, expected >=1`
);

check(
  "msgpackr Workers CSP fallback source",
  msgpackrSource.includes("inlineObjectReadThreshold = Infinity") &&
    msgpackrSource.includes("in CF workers, the new Function call could begin"),
  path.relative(root, msgpackrSourcePath)
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

const unitToKiB = (value: number, unit: string): number => {
  if (unit === "B") return value / 1_024;
  if (unit === "KiB") return value;
  if (unit === "MiB") return value * 1_024;
  throw new Error(`Unsupported Wrangler size unit: ${unit}`);
};

const dryRunDir = mkdtempSync(path.join(tmpdir(), "cloudstash-upload-"));
try {
  const wrangler = spawnSync(
    path.join(root, "node_modules/.bin/wrangler"),
    [
      "deploy",
      "--dry-run",
      "--config",
      workerConfigPath,
      "--outdir",
      dryRunDir,
    ],
    { cwd: root, encoding: "utf8" }
  );
  const output = `${wrangler.stdout ?? ""}\n${wrangler.stderr ?? ""}`;
  check(
    "Wrangler upload dry run",
    wrangler.status === 0,
    wrangler.status === 0
      ? "completed"
      : `exit ${wrangler.status ?? "unknown"}: ${output.trim()}`
  );

  const upload = output.match(
    /Total Upload:\s+([\d.]+)\s+(B|KiB|MiB)\s+\/\s+gzip:\s+([\d.]+)\s+(B|KiB|MiB)/
  );
  if (upload) {
    const rawKiB = unitToKiB(Number(upload[1]), upload[2]);
    const gzipKiB = unitToKiB(Number(upload[3]), upload[4]);
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
  } else {
    check(
      "Wrangler upload size report",
      false,
      `missing Total Upload line: ${output.trim()}`
    );
  }
} finally {
  rmSync(dryRunDir, { force: true, recursive: true });
}

if (failures.length > 0) {
  console.error(`verify-bundle: ${failures.length} assertion(s) failed`);
  process.exit(1);
}
console.log("verify-bundle: all assertions passed");
