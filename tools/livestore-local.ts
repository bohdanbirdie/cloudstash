import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The vendored livestore fork (committed git submodule) is the source of
// livestore code for dev, tests, and production builds — local == prod.
const PKGS = path.resolve(__dirname, "../vendor/livestore/packages/@livestore");

// Off-switch: force the published npm snapshot (A/B "is the bug mine or
// livestore's?"). Also the explicit opt-out the production build guard checks.
export const LIVESTORE_PUBLISHED = process.env.LIVESTORE_PUBLISHED === "1";

// True when @livestore/* should resolve to vendored source — the default,
// unless forced published or the submodule isn't checked out.
export const LIVESTORE_LOCAL = !LIVESTORE_PUBLISHED && existsSync(PKGS);

// wasm packages keep their published prebuilt: the .wasm only loads from that
// layout. Excluded from aliasing and deduped to the published copy below.
const EXCLUDE = new Set(["wa-sqlite", "sqlite-wasm"]);

// Platform-conditional exports (e.g. utils/cuid: browser vs node) can't be a
// static alias — a single file pins one platform. Skip them so they resolve
// from the published package, where Vite picks the right condition per target.
const PLATFORM_CONDITIONS = new Set([
  "browser",
  "node",
  "workerd",
  "worker",
  "react-native",
  "deno",
  "bun",
]);

type AliasEntry = { find: RegExp; replacement: string };

/**
 * Vite resolve config that redirects every @livestore/* entrypoint to the
 * vendored fork source (read from each package's `exports` map) and dedupes
 * `effect`, `react`, and `react-dom` so Effect layers and the React instance
 * stay identical across the cloudstash/livestore boundary. The submodule pins
 * its own react (devDep) in its pnpm store; without dedupe the vendored
 * `@livestore/react` bundles a second React copy → null dispatcher /
 * invalid-hook-call crash in the prod build. Empty when forced published or the
 * submodule is missing.
 * See docs/architecture/livestore-fork-integration.md.
 */
export function livestoreLocalResolve(): {
  alias: AliasEntry[];
  dedupe: string[];
} {
  if (!LIVESTORE_LOCAL) return { alias: [], dedupe: [] };
  const alias: AliasEntry[] = [];
  for (const name of readdirSync(PKGS)) {
    if (EXCLUDE.has(name)) continue;
    const dir = path.join(PKGS, name);
    const pkgJsonPath = path.join(dir, "package.json");
    if (!existsSync(pkgJsonPath)) continue;
    const exp = JSON.parse(readFileSync(pkgJsonPath, "utf8")).exports;
    if (!exp || typeof exp !== "object") continue;
    for (const [sub, target] of Object.entries(exp)) {
      let file: string | undefined;
      if (typeof target === "string") {
        file = target;
      } else {
        const conds = Object.keys(target as Record<string, string>);
        if (conds.some((c) => PLATFORM_CONDITIONS.has(c))) continue;
        file =
          (target as Record<string, string>).import ??
          (target as Record<string, string>).default;
      }
      if (!file) continue;
      const specifier =
        sub === "."
          ? `@livestore/${name}`
          : `@livestore/${name}/${sub.slice(2)}`;
      alias.push({
        find: new RegExp(
          `^${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`
        ),
        replacement: path.join(dir, file),
      });
    }
  }
  console.log(
    `[livestore] aliasing ${alias.length} entrypoints to vendor/livestore`
  );
  return {
    alias,
    dedupe: [
      "effect",
      "react",
      "react-dom",
      ...[...EXCLUDE].map((n) => `@livestore/${n}`),
    ],
  };
}
