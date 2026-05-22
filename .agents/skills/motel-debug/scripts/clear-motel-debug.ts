#!/usr/bin/env bun

import { promises as fs } from "node:fs";
import path from "node:path";

const START_MARKER = "#region motel debug";
const END_MARKER = "#endregion motel debug";
const DEFAULT_IGNORES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".motel-data",
]);
const FILE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"]);

const usage = () => {
  console.log(
    `Usage: bun clear-motel-debug.ts [path]\n\nRemoves blocks wrapped in '${START_MARKER}' and '${END_MARKER}' from JS/TS files under the given path. Defaults to the current directory.`
  );
};

const isHelp = process.argv.includes("--help") || process.argv.includes("-h");
if (isHelp) {
  usage();
  process.exit(0);
}

const root = path.resolve(process.argv[2] ?? process.cwd());

const walk = async (directory: string): Promise<string[]> => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (DEFAULT_IGNORES.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }
    if (entry.isFile() && FILE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
};

const cleanFile = (filePath: string, source: string) => {
  const lines = source.split(/\r?\n/);
  const kept: string[] = [];
  let depth = 0;
  let changed = false;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const hasStart = line.includes(START_MARKER);
    const hasEnd = line.includes(END_MARKER);

    if (hasStart) {
      depth += 1;
      changed = true;
      continue;
    }

    if (hasEnd) {
      if (depth === 0) {
        throw new Error(`Unmatched ${END_MARKER} in ${filePath}:${index + 1}`);
      }
      depth -= 1;
      changed = true;
      continue;
    }

    if (depth === 0) {
      kept.push(line);
    } else {
      changed = true;
    }
  }

  if (depth !== 0) {
    throw new Error(`Unmatched ${START_MARKER} in ${filePath}`);
  }

  return {
    changed,
    content: kept.join("\n"),
  };
};

const files = await walk(root);
const changedFiles: string[] = [];

for (const filePath of files) {
  const source = await fs.readFile(filePath, "utf8");
  if (!source.includes(START_MARKER) && !source.includes(END_MARKER)) continue;
  const result = cleanFile(filePath, source);
  if (!result.changed) continue;
  await fs.writeFile(filePath, result.content, "utf8");
  changedFiles.push(path.relative(root, filePath) || path.basename(filePath));
}

if (changedFiles.length === 0) {
  console.log(`No '${START_MARKER}' blocks found under ${root}`);
  process.exit(0);
}

console.log(`Removed motel debug blocks from ${changedFiles.length} file(s):`);
for (const file of changedFiles) {
  console.log(`- ${file}`);
}
