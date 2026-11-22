# Cloudstash

Link saving app with AI-powered summaries. Full-stack TypeScript on Cloudflare Workers.

## Commands

Use **bun** (not npm) for all commands.

```bash
bun dev              # Vite+ dev server (port 3000)
bun run dev:infra    # Auth emulator, tunnel, dashboard, raycast (separate terminal)
bun test             # Run all tests
bun run test:unit    # Unit tests only
bun run typecheck    # Type checking
bun run check        # Lint + format (Vite+) + Effect diagnostics
bun run fix          # Fix lint issues
```

**Linting:** Uses oxlint and oxfmt via Vite+ (NOT eslint). Don't use eslint-disable comments.

**NEVER run remote wrangler commands** (migrations, deployments, secrets, etc.). Local only:

```bash
bun run db:migrate:local   # OK - local migrations
bun run db:migrate:remote  # FORBIDDEN
bun run deploy             # FORBIDDEN
```

## Stack

- **Frontend:** React 19, Vite, TailwindCSS 4, TanStack Router, Zustand
- **Backend:** Cloudflare Workers, Hono.js, D1 (SQLite), Drizzle ORM
- **Real-time:** Livestore sync
- **AI:** Vercel AI SDK + OpenRouter
- **Auth:** Better Auth + Google OAuth

## Raycast Extension (separate repo)

`local/raycast-extension/` is a local clone of [bohdanbirdie/cloudstash-raycast](https://github.com/bohdanbirdie/cloudstash-raycast) (gitignored). It's a separate project with its own package manager (npm), dependencies, and tooling. Do NOT run bun commands inside it — use npm.

- **Server-side connect endpoints** live in this repo: `src/cf-worker/connect/`
- **Extension code** lives in the clone: `local/raycast-extension/src/`
- The only connection is the HTTP API contract (no shared imports)

## Local Repos

`local/` contains gitignored clones of external repos. Run `bun run sync` to clone/update all.

- `local/raycast-extension/` — Raycast extension (npm, separate repo)
- `local/readonly-llm-lookup/` — Reference implementations for external libraries (Effect, Livestore, etc.)

## Intent Layer (`context/`)

`context/` is the only always-current durable source for Cloudstash's product
and system intent. Start with `context/intuition.md`; `context/spec.md` defines
the tree, artifact ownership, ID scheme, precedence, and lifecycle.

- A behavior or contract change updates its owning Intent node in the same PR.
- Consequential accepted choices belong in `.decisions/`; confirmed drift in
  `.delta/`; unresolved design uncertainty in `open-questions.md`; non-binding
  future direction in `roadmap.md`.
- Plans, implementation status, and task checklists stay in `docs/kanban.md` and
  `docs/todos/`.
- `vision.md` and `requirements.md` are protected. Confirm with the maintainer
  before changing goals, constraints, tradeoffs, or guarantees.
- Run `bun run check:intent` after editing the corpus.

## Documentation

- `docs/architecture/` — Derived system explanations (auth, worker resilience, link processor); they must not contradict the owning `context/` node.
- `docs/features/` — Derived feature explanations. Check for implementation history, then verify durable claims against the owning `context/` node.
- `docs/diagrams/` — Excalidraw diagrams (`.excalidraw` files). Viewable in the Obsidian Excalidraw plugin or at excalidraw.com. Agents can create/edit these files directly as JSON.
- `docs/kanban.md` — Task board (Obsidian kanban-plugin). Add tasks here as `- [ ] Title` under `## Todo` / `## In Progress` / `## Done`. Link to a `docs/todos/<slug>.md` doc when a task needs more than a one-liner.
- `docs/` is an Obsidian vault. Use `[[path/filename]]` wiki links for cross-references between docs (no `.md` extension). **Do not use `[[path|alias]]` syntax inside markdown tables** — the `|` conflicts with the table column separator.

## Livestore Sync

- **`ServerAheadError` is NOT a failure.** It's a normal part of livestore's eventual consistency protocol. When a client push is rejected (server has newer events), the push fiber parks, the server broadcasts missing events via the live pull stream, the client rebases its pending events on top, and the push fiber restarts with correct sequence numbers. Do not treat this as an error requiring manual intervention or store resets.
- **`MaterializeError`** wraps SQLite errors during event materialization. With the default `onSyncError: 'ignore'`, the error is silently swallowed but the batch transaction rolls back — the store continues in a degraded state. A common cause is duplicate eventlog inserts (no `ON CONFLICT` guard in livestore's `insertIntoEventlog`).
- **LinkProcessorDO is a livestore client** that connects to `SyncBackendDO` with `livePull: true`. It must have exclusive access to its DO SQLite — concurrent `createStoreDoPromise` calls on the same storage corrupt the eventlog (PR #30).

## Testing DO eviction (local — proven)

- **DO eviction IS reproducible locally, deterministically. This has been proven — do not claim otherwise.** `abortAllDurableObjects()` from `cloudflare:test` (the `@cloudflare/vitest-plugin` runtime, which runs locally) tears down a DO's in-memory isolate while preserving its persisted SQLite — exactly the production idle-eviction that kills un-awaited background fibers. Proven by the incarnation-probe test in `src/cf-worker/__tests__/e2e/server-ingest-stranding.test.ts`: a random in-memory id stamped via `runInDurableObject` changes across the abort.
- Use `abortAllDurableObjects()` + `runInDurableObject` to test eviction-sensitive behavior. Acquire a **fresh** stub after the abort — stubs created before it are poisoned. To assert a write survived eviction, read the persisted source of truth from a fresh stub (e.g. `SYNC_BACKEND_DO` → `getEventlogMax()`), not through the evicted client DO.

## Livestore Version (published snapshot)

cloudstash uses the **published upstream snapshot** of LiveStore: every `@livestore/*` package in `package.json` and `apps/extension/package.json` is pinned to the same `0.0.0-snapshot-<upstream-commit-sha>` version. Upstream publishes a snapshot for each commit on `livestorejs/livestore` `main`. There is no local copy of the LiveStore source and no Vite alias.

- **Bump:** change every `@livestore/*` pin (app and extension) to the new snapshot SHA in one commit, then `bun install`. Keep all pins on the same SHA. A new `@livestore/*` package also needs an entry in `bunfig.toml` `minimumReleaseAgeExcludes`, because snapshots are always younger than the 7-day gate.
- **Validate after a bump:** `bun run check`, `bun run typecheck`, `bun run test:unit`, `bun run test:e2e`, `bun run build`, `bun run test:bundle`. If the bump changes a DO SQLite schema, run `bun run clean:local-state` locally and bump `PERSISTENCE_FORMAT_VERSION` for deployed DOs.
- **Working on a LiveStore fix:** clone upstream outside this repo, land the fix upstream, then bump to the published snapshot of that commit.

## Conventions

- Path alias: `@/*` maps to `src/*`
- Routes in `src/routes/_authed/` require authentication
- Database migrations: `bun run db:generate` then `bun run db:migrate:local`. **Review generated SQL before committing** — a table rebuild (`__new_<table>`/`DROP TABLE`) for an unrelated change means snapshot drift and can cascade-delete child rows. See `drizzle/migrations/MANUAL_SNAPSHOT_FIXES.md` (records a hand-edit to `0010_snapshot.json` and why).
- Avoid code comments unless absolutely necessary for complex logic
- No barrel files (index.ts re-exports) - import directly from source files
- **Patches:** When patching packages with pre-built dist files, patch `dist/*.js` directly (not just `src/*.ts`). Runtime imports from dist, not source.
- **Tracing:** All worker-side `Effect.runPromise` calls must have `AppLayerLive(env)` (or at minimum `OtelTracingLive(env)`) in their layer chain. `AppLayerLive` already includes tracing — prefer using it for new code.

<!-- effect-solutions:start -->

## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

**Caveat:** the app is on effect **v4** (`4.0.0-beta.99`) and some effect-solutions guides predate it — cross-check any pattern against the v4 API before using it (`local/readonly-llm-lookup/effect` is a v4-era reference; the migration's binding idiom decisions live in `docs/todos/effect-v4-migration-progress.md`).

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `local/readonly-llm-lookup/effect` for real implementations

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.

### Authorization and boundary design

- Decode route paths, headers, request bodies, and other external values with
  Effect Schema instead of handwritten `typeof` or property-presence guards.
- Infer domain types from schemas and service implementations. Reserve explicit
  interfaces for genuine external ports and contracts.
- Keep authorization services flat: separate credential resolution from the
  shared current-access check, and use `Option`, `Match`, and early failures to
  express branching.
- Use Effect error combinators or exhaustive `Match` functions instead of
  inspecting `_tag` fields manually.
- Translate authorization errors to HTTP or protocol responses in a shared,
  intentional boundary layer rather than repeating tag matrices in consumers.
- Decode route variants directly instead of maintaining parallel boolean flags
  for route dispatch.

<!-- effect-solutions:end -->
