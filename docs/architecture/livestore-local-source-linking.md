# Livestore local source linking

How cloudstash resolves `@livestore/*` to the vendored fork's TypeScript source
(no published snapshot, no hand-written bun patch) — the in-depth mechanism.

> Strategy, status, and the operating model live in
> [[architecture/livestore-fork-integration]] — start there for the big picture.
> This doc is the resolution mechanism in depth.

## TL;DR

The vendored fork at `vendor/livestore` (a committed git submodule) is the
**default** livestore source for dev, tests, and production builds. First-time
setup:

```bash
bun run livestore:install   # git submodule update --init + pnpm install in vendor/livestore
# (also done by `bun run sync`)

# then, from the cloudstash root — no env var needed:
bun dev                     # dev server uses vendored fork source
bun run test:unit
bun run test:e2e
```

Off-switch (A/B against the published snapshot):

```bash
LIVESTORE_PUBLISHED=1 bun run dev   # or: bun run dev:published
```

For scratch experiments, `git checkout` a branch inside `vendor/livestore` — the
alias reads that working tree directly.

## Why this works with no build step

The vendored fork's package `exports` point at TypeScript **source**
(`"./cf-worker": "./src/cf-worker/mod.ts"`); only `publishConfig.exports` use
`dist/`. cloudstash bundles everything through Vite (dev, build, and both vitest
configs), so Vite/Rolldown transpiles the fork's `.ts` on the fly. Edit source →
reload. No livestore build required.

## How the swap is wired

`tools/livestore-local.ts` reads each vendored package's `exports` map and builds
one Vite alias per entrypoint (so subpaths like `@livestore/sync-cf/cf-worker`
resolve to source). It is **on by default** (off only with `LIVESTORE_PUBLISHED=1`
or when the submodule is absent) and consumed by `vite.config.ts`,
`vitest.config.ts`, and `vitest.e2e.config.ts`. `vite.config.ts` additionally
throws on `vp build` if the submodule is missing, so a production build can't
silently fall back to the published snapshot.

Three non-obvious details:

- **`effect` is deduped.** The submodule resolves `effect` from its pnpm store
  while cloudstash resolves its own copy. Two copies of Effect break
  `Context`/`Layer` identity ("service not found"). `resolve.dedupe: ['effect']`
  collapses them to cloudstash's single copy (both are 3.21.2). Verified: bundling
  drops from 2 effect copies to 1.
- **`wa-sqlite` / `sqlite-wasm` stay published.** Their prebuilt `.wasm` loads
  via a path layout the test env only resolves from the published copy. They are
  not packages we fork, so they are excluded from the source aliasing **and**
  added to `resolve.dedupe` — otherwise the submodule's pnpm workspace symlinks
  pull its copies transitively and wasm init fails.
- **Platform-conditional exports are NOT aliased.** A static alias points at one
  file, so it can't honor `{ browser, node, … }` export conditions — e.g.
  `@livestore/utils/cuid` would pin the `node` variant and crash the browser
  (`process.pid` undefined). The generator skips any export keyed by a platform
  condition (`browser`/`node`/`workerd`/…), letting it resolve from the published
  package where Vite picks the right variant per build environment. Only
  `utils/cuid` is affected today. Tests run server-side and won't catch this —
  the browser app is the only place it shows.

## Running livestore's own tests

The submodule is a normal pnpm workspace. Use pnpm inside it (like the raycast
clone uses npm):

```bash
pnpm --dir vendor/livestore --filter @livestore/common-cf test   # DO WebSocket RPC + hibernation suite
pnpm --dir vendor/livestore --filter @livestore/common test
```

## The loop

1. Edit `vendor/livestore/packages/@livestore/<pkg>/src/...`.
2. `bun run test:e2e` (or `bun dev`) — change is live, no build, no env var.
3. Add/run a regression test in the submodule with
   `pnpm --dir vendor/livestore --filter <pkg> test`.
4. When happy, push to the fork branch and `git add vendor/livestore` to record
   the new SHA (see [[architecture/livestore-fork-integration]]).

**DO schema changes:** if the livestore branch alters a Durable Object SQLite
table, run `bun run clean:local-state` before restarting `bun dev` — otherwise the
old local DO storage has a stale schema (`no such column: …`), because livestore
creates tables with `CREATE TABLE IF NOT EXISTS` and never reconciles columns.
livestore's intended migration path for these tables is the **versioned table
name** (`rpc_subscription_${PERSISTENCE_FORMAT_VERSION}` etc.): bumping
`PERSISTENCE_FORMAT_VERSION` makes the new code create a fresh table and abandon
the old one. A schema change that forgets to bump the version silently breaks
any DO that already has that versioned table — server-side tests start from
empty storage and won't catch it; only running against the real app with
existing local DO state does (this is how PR #1338's missed bump surfaced).

Related: [[architecture/sync-backend-do-hibernation-billing]].
