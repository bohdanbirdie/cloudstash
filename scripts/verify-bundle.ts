import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { livestoreBuildValue } from "../tools/livestore-local.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const workerBundlePath = path.join(root, "dist/cloudstash/index.js");
const clientAssetsDir = path.join(root, "dist/client/assets");

const failures: string[] = [];
const check = (label: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "ok" : "FAIL"}  ${label} (${detail})`);
  if (!ok) failures.push(label);
};

const countOccurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

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
  "msgpackr CF-Workers fallback present",
  countOccurrences(worker, "inlineObjectReadThreshold") >= 1,
  `"inlineObjectReadThreshold" x${countOccurrences(worker, "inlineObjectReadThreshold")}, expected >=1`
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

if (failures.length > 0) {
  console.error(`verify-bundle: ${failures.length} assertion(s) failed`);
  process.exit(1);
}
console.log("verify-bundle: all assertions passed");
