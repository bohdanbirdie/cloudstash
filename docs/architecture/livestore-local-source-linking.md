# Livestore local source linking

Short-loop workflow for editing livestore and testing the change in cloudstash
without publishing a snapshot or hand-writing a bun patch.

> Strategy, current/target state, and the production roadmap (submodule
> vendoring) live in [[architecture/livestore-fork-integration]] — start there
> for the big picture; this doc is the dev mechanism in depth.

## TL;DR

```bash
bun run sync                          # clone external repos (first time)
cd local/livestore && pnpm install    # install the clone (pnpm, NOT bun)

# then, from the cloudstash root:
LIVESTORE_LOCAL=1 bun dev             # dev server uses local clone source
LIVESTORE_LOCAL=1 bun run test:unit   # unit tests use local clone source
LIVESTORE_LOCAL=1 bun run test:e2e    # Workers-pool e2e uses local clone source
```

Without the env var, everything resolves to the published
`0.0.0-snapshot-*` packages exactly as before — zero behavior change.

## Why this works with no build step

The `local/livestore` clone is checked out at the same git SHA as the published
snapshot cloudstash consumes, and livestore's package `exports` point at
TypeScript **source** (`"./cf-worker": "./src/cf-worker/mod.ts"`); only
`publishConfig.exports` use `dist/`. cloudstash bundles everything through Vite
(dev, build, and both vitest configs), so Vite/Rolldown transpiles the clone's
`.ts` on the fly. Edit source → reload. No livestore build required.

## How the swap is wired

`tools/livestore-local.ts` reads each clone package's `exports` map and builds
one Vite alias per entrypoint (so subpaths like `@livestore/sync-cf/cf-worker`
resolve to source). It is gated on `LIVESTORE_LOCAL=1` and consumed by
`vite.config.ts`, `vitest.config.ts`, and `vitest.e2e.config.ts`.

Three non-obvious details:

- **`effect` is deduped.** The clone resolves `effect` from the pnpm store while
  cloudstash resolves its own copy. Two copies of Effect break `Context`/`Layer`
  identity ("service not found"). `resolve.dedupe: ['effect']` collapses them to
  cloudstash's single copy (both are 3.21.2). Verified: bundling drops from 2
  effect copies to 1.
- **`wa-sqlite` / `sqlite-wasm` stay published.** Their prebuilt `.wasm` loads
  via a path layout the test env only resolves from the published copy. They are
  not packages we patch, so they are excluded from the source aliasing **and**
  added to `resolve.dedupe` — otherwise the clone's pnpm workspace symlinks pull
  the clone copies transitively and wasm init fails.
- **Platform-conditional exports are NOT aliased.** A static alias points at one
  file, so it can't honor `{ browser, node, … }` export conditions — e.g.
  `@livestore/utils/cuid` would pin the `node` variant and crash the browser
  (`process.pid` undefined). The generator skips any export keyed by a platform
  condition (`browser`/`node`/`workerd`/…), letting it resolve from the published
  package where Vite picks the right variant per build environment. Only
  `utils/cuid` is affected today; it isn't a package we patch. Tests run
  server-side and won't catch this — the browser app is the only place it shows.

## Running livestore's own tests

The clone is a normal pnpm workspace. Use pnpm inside it (like the raycast
clone uses npm):

```bash
cd local/livestore
pnpm --filter @livestore/common-cf test   # DO WebSocket RPC + hibernation suite
pnpm --filter @livestore/common test
```

## The loop

1. Edit `local/livestore/packages/@livestore/<pkg>/src/...`.
2. `LIVESTORE_LOCAL=1 bun run test:e2e` (or `bun dev`) — change is live, no build.
3. Add/run a regression test in the clone with `pnpm --filter <pkg> test`.
4. When happy, fold the change into the bun patch (or upstream it).

**DO schema changes:** if the livestore branch alters a Durable Object SQLite
table, run `bun run clean:local-state` before `bun run dev:local` — otherwise the
old local DO storage has a stale schema (`no such column: …`), because livestore
creates tables with `CREATE TABLE IF NOT EXISTS` and never reconciles columns.
livestore's intended migration path for these tables is the **versioned table
name** (`rpc_subscription_${PERSISTENCE_FORMAT_VERSION}` etc.): bumping
`PERSISTENCE_FORMAT_VERSION` makes the new code create a fresh table and abandon
the old one. A schema change that forgets to bump the version silently breaks
any DO that already has that versioned table — server-side clone tests start
from empty storage and won't catch it; only running against the real app with
existing local DO state does (this is how PR #1338's missed bump surfaced).

Related: [[architecture/sync-backend-do-hibernation-billing]].
