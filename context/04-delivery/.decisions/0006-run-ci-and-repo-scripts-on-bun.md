# Run CI and repository scripts on Bun

Status: accepted

## Context

CI installed Node 25 beside Bun in every PR job, and the repository's custom
scripts and tool tests reached for `node:` modules directly. The toolchain
binaries (Vitest, Vite+, effect-tsgo, wxt) declare a `node` shebang, so on a
runner that also ships Node they run on Node unless Bun is told otherwise. The
maintainer wants scripts and CI on Bun with Effect's platform services; the
deployed Worker runs on workerd and is out of scope.

## Evidence and Argument

On Bun 1.4.5 with Node removed from `PATH`, every PR-check and extension
publish command passed locally through `bun --bun run`, and `--bun` carries
into nested `node` invocations, so chained package scripts also run on Bun.

The unit job was the one failure: six files saw `import { z } from "zod"` as
`undefined`. Bun reports `"__esModule" in namespace` as true for ES module
namespaces, so Vitest's default-export interop replaced zod's namespace with
its default export, the `z` namespace itself, which has no `z` key. Turning
off `deps.interopDefault` in the unit Vitest config leaves externalized
packages to native ESM, which already resolves CommonJS defaults; the full unit
suite then passed on both Bun and Node.

## Options

| Option                                           | Tradeoffs                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| Keep Node in CI                                  | No change, but two runtimes and tools silently run on the runner Node |
| Run on Bun, keep Node only for the unit job      | Avoids the zod failure but leaves one job on a different runtime      |
| Run on Bun everywhere, turn off Vitest's interop | One runtime; the unit config differs from Vitest's default            |

## Decision

Pin one Bun version in `.bun-version`, `packageManager`, and every workflow.
PR checks and extension publishing have no Node setup step and run their
commands with `bun --bun`. The unit Vitest config sets
`deps.interopDefault: false`. Repository scripts under `scripts/` and tool
tests under `tools/` use `FileSystem`, `Path`, and `ChildProcessSpawner` from
`@effect/platform-bun` where they map cleanly; file-touching tool tests run as
`@effect/vitest` layer tests. Third-party APIs inside scripts (Vite, Miniflare,
Stripe, Drizzle's migration reader, `node:zlib` gzip for the upload budget)
stay as they are.
