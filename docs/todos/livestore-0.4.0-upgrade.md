# Upgrade LiveStore: snapshot → v0.4.0 stable

Move off the pinned snapshot (`0.0.0-snapshot-6e9abadf4bdc91a2f7deea3e47be8ffd75d4c27c`, cut **2026-05-13**) to the tagged **v0.4.0** release (**2026-06-02**). Reviewed 2026-06-07.

## Why this is low-risk

Our snapshot is a **direct ancestor** of the v0.4.0 tag — 53 commits behind, 0 ahead. Of those 53 commits, ~50 are pure release/CI tooling (DevTools cert, pnpm repins, effect-utils lock sync, CHANGELOG wording, NPM_TOKEN). The only functional changes in the entire gap are:

- `c943d9bd fix(react): scope useRcResource cache by Store (#1241)` — bugfix: prevents stale `useQuery` results when a store is disposed and recreated with the same `(storeId, clientId, sessionId)`. Mildly relevant — we shut down + recreate stores on auth failure / org switch.
- `154e002e Bump effect-utils` — peer-deps refresh, **no effect version change** (see below).
- `e6c12817 Fix tsconfig errors from tsgolint` — internal.

**Every breaking change in the v0.4.0 changelog landed _before_ our snapshot — we already run all of them.** Validated each against our code:

| v0.4.0 breaking change                            | Our code                                                            | Status           |
| ------------------------------------------------- | ------------------------------------------------------------------- | ---------------- |
| `store.shutdown()` returns Effect                 | `store.shutdownPromise()` everywhere (store.ts:78 + tests)          | already migrated |
| `store.subscribe(query$, cb, opts)`               | durable-object.ts:238,317 new signature                             | already migrated |
| `QueryBuilder.first()` returns undefined          | 1 site (queries/links.ts:126); already on new behavior, tests green | already absorbed |
| `livestore.RawSql` not auto-added                 | no raw-SQL-event usage                                              | N/A              |
| wa-sqlite version alignment                       | already depend on `@livestore/wa-sqlite`                            | N/A              |
| CF sync: default DO SQLite, no implicit D1        | SyncBackendDO passes no `storage` → DO SQLite default               | safe             |
| `LiveStoreEvent`/`EventSequenceNumber` namespaces | zero references                                                     | N/A              |
| `UnexpectedError` → `UnknownError`                | zero references                                                     | N/A              |
| React multi-store API                             | `StoreRegistryProvider` + `useStore({})` + `store.useQuery`         | already migrated |
| removed top-level `useQuery`/`useClientDocument`  | never imported top-level                                            | N/A              |
| S2 proxy helper signatures                        | we don't use sync-s2                                                | N/A              |

**Effect does not move:** `@livestore/peer-deps@0.4.0` pins `effect@3.21.2` + `@effect/vitest@0.29.0` — identical to what we run. (Changelog text "Effect 3.17.14" is stale.) This bump does **not** unblock effect v4 — livestore is still on effect v3, so the `@effect/vitest@0.29.0`-vs-vitest-4 peer mismatch situation is unchanged.

## Blocker: 7-day cooldown

`bunfig.toml` sets `minimumReleaseAge = 604800` (7 days). v0.4.0 published 2026-06-02, so a normal `bun install` refuses it until **2026-06-09**. Plan: wait for the cooldown to clear naturally, then install. (CI uses `--frozen-lockfile`, which does not re-check the cooldown — so once the lockfile pins 0.4.0, CI is unaffected.)

If we ever need it sooner: add the `@livestore/*` packages to `minimumReleaseAgeExcludes` in `bunfig.toml` for the install, then revert.

## Mechanical steps

1. **Bump 9 packages to `0.4.0`** in `package.json`:
   - deps: `@livestore/adapter-cloudflare`, `@livestore/adapter-web`, `@livestore/livestore`, `@livestore/peer-deps`, `@livestore/react`, `@livestore/sync-cf`, `@livestore/wa-sqlite`
   - devDeps: `@livestore/devtools-vite`
   - `@livestore/common-cf` (transitive) via `patchedDependencies` — see step 2.
   - LiveStore enforces matching versions across all packages, so bump them in lockstep.

2. **Re-point the common-cf patch.** Rename `patches/@livestore%2Fcommon-cf@0.0.0-snapshot-6e9abadf4bdc91a2f7deea3e47be8ffd75d4c27c.patch` → `patches/@livestore%2Fcommon-cf@0.4.0.patch`, and update the `patchedDependencies` key from `@livestore/common-cf@0.0.0-snapshot-...` → `@livestore/common-cf@0.4.0`.
   - **Verified the patch applies:** v0.4.0's published `dist/do-rpc/client.js` blob hash is `6aa2a24a0956bcf373c14179e6e6d0917942b2fa` and `server.js` is `053586432d80472e796b3c09b56f060c163de685` — byte-identical to our patch's base. No content edits needed.
   - The `@effect/rpc@0.75.1` patch is unchanged (peer-deps@0.4.0 still pins `@effect/rpc@0.75.1`).

3. **Keep the patch — do NOT drop it.** [livestorejs/livestore#1266](https://github.com/livestorejs/livestore/pull/1266) (the upstream fix for the DO-RPC msgpack streaming stall) is still **open** and is **not** in v0.4.0 (no do-rpc commits in the 53-commit gap). So the bug remains unfixed upstream and our patch stays necessary. Note #1266 fixes it differently (per-request parser scoping) than our patch (drain-then-decode + return `runStream` to keep the ReadableStream open). When #1266 merges (post-0.4.0), revisit dropping the patch — see [[todos/drop-livestore-common-cf-patch]] and [[architecture/livestore-do-rpc-stream-stall]].

4. **Install + verify.** `bun install` → confirm `0.4.0` resolved for all packages and the drain-buffer patch is present in `node_modules/@livestore/common-cf/dist/do-rpc/client.js`.

5. **Run the full suite:** `bun run build` (rolldown — the comprehensive check that caught the kysely break), `bun run check`, `bun run typecheck`, `bun run test:unit`, `bun run test:e2e`, `bun run test:ext`.

## Optional feature adoptions (independent of the bump)

These v0.4.0 capabilities already ship in our snapshot, so they can be adopted today regardless of the version bump. Tracked here for convenience:

- **`onBackendIdMismatch`** (backend reset detection) — not currently set. Relevant to `SyncBackendDO.purgeAll()` (account deletion) and any DO state reset: lets clients with stale OPFS state recover (`'reset'`/`'shutdown'`/`'ignore'`).
- **`unknownEventHandling`** on the schema — not currently set. Forward-compat for our many clients (web, Chrome ext, Raycast, Telegram, link-processor) on different update cadences when new event types ship.
- **Event `deprecated` markers** — mark `v1.LinkCreated` (superseded by `v2.LinkCreated`) deprecated to catch any client still emitting the old shape.
- **`Store.Tag(schema, storeId)`** Effect API — could clean up manual store threading in the DOs (`cachedStore`/`storeCreationPromise`), but our exclusive-single-instance access requirement may not map cleanly onto `Store.Tag.layer()`'s scoped lifecycle. Spike before adopting.
