# Livestore data-layer tests (no UI)

Comprehensive coverage of the livestore event-sourcing layer with in-memory persistence. No React, no DOM interaction — just schema, materializers, queries, and consumer code that takes a `Store` directly.

**Approach:** `makeInMemoryAdapter()` from `@livestore/adapter-web` + `createStorePromise` from `@livestore/livestore`. Runs under Vitest with `environment: 'jsdom'` (required by sqlite-wasm browser build). No OPFS, no workers, no sync backend.

Supersedes [[eliminate-vi-mock]] — the `vi.mock` usage in `tools.test.ts` gets replaced by a real in-memory store instead of a DI refactor.

## Phase A0 — Infrastructure

- `src/livestore/__tests__/test-helpers.ts`
  - `makeTestStore(): Promise<Store<typeof schema>>` using `makeInMemoryAdapter()` (also resets the `testId` counter)
  - `testId(prefix)` deterministic id generator
  - `silentLogger` — `Logger.withMinimumLogLevel(LogLevel.None)` for Effect-based tests
  - Per-describe seed helpers (`seedLink`, `seedTag`, …) live inline in each test file
- Add `src/livestore/__tests__/**/*.test.ts` to `vitest.config.ts#test.include`
- Per-file `// @vitest-environment jsdom` directive (required by sqlite-wasm browser build)
- PoC: `materializers/links.test.ts` — validates the whole setup end-to-end

## Phase A1 — Materializers (6 files, by entity)

- `materializers/links.test.ts` — Created v1 & v2, Completed, Uncompleted, Deleted, Restored, URL dedup via unique index
- `materializers/tags.test.ts` — Created, Renamed, Reordered, **Deleted cascade** (multi-statement removing both tag and link_tags rows)
- `materializers/link-tags.test.ts` — Tagged (dedup via unique index), **UntaggedV1 vs UntaggedV2** (v1 by id, v2 precise by linkId+tagId)
- `materializers/link-processing.test.ts` — Started (upsert), Completed, Failed, Cancelled (replace-on-conflict), ReprocessRequested, SourceNotified
- `materializers/link-content.test.ts` — MetadataFetched, Summarized, Interacted
- `materializers/tag-suggestions.test.ts` — Suggested, Accepted, Dismissed

## Phase A2 — Queries (3 files)

- `queries/links.test.ts` — counts (inbox/completed/all/trash), list queries with LEFT JOIN snapshots/summaries, sort order, soft-delete filtering, linkById/linkByUrl, linksByIds dynamic placeholders, recentlyOpenedLinks grouping, **searchLinks$ scoring** (weighted LIKE)
- `queries/tags.test.ts` — allTags (soft-deleted excluded), tagsForLink, tagCounts, allTagsWithCounts COALESCE, untaggedCount NOT EXISTS, pendingSuggestionsForLink
- `queries/filtered-links.test.ts` — linksWithTag, untaggedLinks, linksWithAllTags (COUNT DISTINCT), filteredLinks composite (status × tagIds × untagged combinations)

## Phase A3 — Feature flows (event replay, end-to-end)

- `flows/link-ingestion.test.ts` — Created → ProcessingStarted → MetadataFetched → Summarized → TagSuggested×N → ProcessingCompleted. Assert state across all tables.
- `flows/tagging.test.ts` — add/remove tag diffing commits correct events; idempotent re-commit
- `flows/reprocess.test.ts` — ReprocessRequested → rerun without duplicate suggestions (regression for commit d7ed697)
- `flows/tag-deletion-cascade.test.ts` — tagDeleted removes link_tags rows (regression for duplicate-tag crash)
- `flows/event-migration.test.ts` — eventlog with mixed v1 and v2 events (`LinkCreated`, `LinkUntagged`) materializes correctly

## Phase A4 — Consumer-code rewrites on real store

- **`tools.test.ts`** — drop both `vi.mock` calls. Seed a real store, run each chat-agent tool, assert on committed events + query results.
- **`process-link.test.ts`** / **`do-programs.test.ts`** — if they stub the store, switch to real in-memory store.
- New: **`link-event-store.live.test.ts`** — Effect service wrapper with real store.
- New: **`link-repository.live.test.ts`** — Effect service queries/deduplication.

## Out of scope (separate tracks)

- **UI feature tests:** see [[livestore-testing-ui]]
- **DO-to-DO sync:** see [[e2e-do-sync-testing]] (workerd pool)
