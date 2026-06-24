# Make initial sync blocking (large-eventlog first-sync UX)

Root-caused **2026-06-24** during the [[architecture/sync-backend-do-hibernation-billing|DO-hibernation]] burst validation. Deferred — captured here for a future pass.

## Symptom

A fresh client (new browser / clean OPFS) logging into an org with a large history shows links **appearing incrementally after the page renders** — links pop in, some vanish (deletes replaying), AI summaries trickle in over tens of seconds. It looks stuck/confusing but eventually completes. Observed with ~1400-link inbox.

## What it is NOT

- **Not a stall or data loss** — it always finishes; the server eventlog is complete the whole time.
- **Not the DO-hibernation fix.** That's clean. The `SyncBackend DO woke up` logs during the long pull are just normal hibernate/wake cycles, not the cause.

## Root cause

A fresh client replays the **entire eventlog** to rebuild local state, so first-sync cost is **O(total history), not O(live state)**.

Concrete measurement from the burst test: **10,665 events to render 18 live links** (the rest was create/delete churn — 1,519 created, 1,503 later deleted). Every event is replayed, materialized into the local SQLite, and pushed through reactive queries + React render on the way. Create+delete pairs and superseded summaries are pure dead weight, and they're replayed on **every** fresh device, forever.

## The lever

`src/livestore.worker.ts`:

```ts
initialSyncOptions: { _tag: "Blocking", timeout: 5000 }
```

Boot blocks on a race (`@livestore/common` → `leader-thread/make-leader-thread-layer.ts:304-384`). The `blockingDeferred` resolves on **whichever comes first**:

- the pull reaching `NoMore` (fully caught up to server head), or
- a forked fiber that fires after the wall-clock `timeout`.

So with `timeout: 5000`: a large backlog **can't** finish in 5 s → the timeout wins → boot completes with **partial** state → the rest streams in **post-render** (the observed behavior). A returning user with warm OPFS reaches `NoMore` in well under 5 s → resolves early → stays **instant-open**. The 5 s ceiling is the whole bug, and the race self-scopes (no manual "backlog size" threshold needed).

## Options

1. **Raise `timeout` to ~15–20 s** — one-line change; blocks realistic backlogs to completion → clean load-then-full-inbox, no flicker; returning users unaffected.
   - **Tradeoff:** the timeout doubles as the **safety fallback** for unreachable/offline sync, so too-long = a blank spinner when sync is genuinely down. And a backlog larger than the cap still falls back to partial. A fixed wall-clock can't perfectly serve both "block until done for big backlogs" and "fail fast when sync is broken."

2. **Determinate progress bar.** livestore already emits `BootStatus { stage: 'syncing', progress: { done, total } }`, and `@livestore/adapter-web` pipes it to the main thread (`single-tab-adapter.ts:277`). But `@livestore/react` does **not** expose it to app components (the current boot UI is a binary `<Suspense>` boundary in `src/routes/_authed.tsx`). Surfacing it (small upstream add, or a local subscription to the adapter's boot-status queue) turns a 15 s spinner into "Syncing 6,343 / 10,665…".

3. **Better upstream `Blocking` semantics.** Extend `Blocking` to resolve on `NoMore` **or a connection-stall signal** instead of a fixed wall-clock — the correct "block until synced without hanging on broken sync." Raise with the livestore author (open channel via [livestorejs/livestore#1338](https://github.com/livestorejs/livestore/pull/1338) / [#1328](https://github.com/livestorejs/livestore/issues/1328)).

4. **The only O(state) fix (long-term, upstream).** Server snapshot/bootstrap (client loads materialized state + live-syncs the delta) or eventlog compaction (collapse create/delete pairs + superseded summaries). Removes the replay entirely; biggest lift.

## Recommendation

Short-term: option **1** (+ **2** for honesty) is in our control and fixes the reported confusion. Options **3/4** are the durable upstream fixes. Note severity is **test-inflated today** — the 10.6k events are burst-test churn; real urgency rises only as power users accumulate large histories across multiple devices.

## Related

- [[todos/links-list-performance|Links list rendering performance at 150+ links]]
- [[architecture/sync-backend-do-hibernation-billing|DO-hibernation / billing post-mortem]] (the validation session that surfaced this)
