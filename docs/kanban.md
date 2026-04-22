---
kanban-plugin: board
---

## Todo

- [ ] [[todos/telegram-login-link|Simplify Telegram bot auth with login link]]
- [ ] [[todos/e2e-do-sync-testing|E2E testing for DO-to-DO sync]]
- [ ] [[todos/livestore-testing-ui|Livestore UI feature tests (RTL)]]
- [ ] [[todos/progress-tracker-sqlite-review|Review stateful SQLite ProgressTracker]]
- [ ] [[todos/managed-effect-runtime-do|Explore ManagedRuntime for LinkProcessorDO]]
- [ ] Develop CLI for ingestion and management
- [ ] Review and consolidate rate limiting / usage limits
- [ ] Develop Chrome extension to save links
- [ ] Review and develop Twitter integrations (https://x.com/mynameistito/status/2046213790623301955)
- [ ] iOS Shortcut as injection source
- [ ] Use Cloudflare Email instead of Resend
- [ ] Replace OpenRouter with Cloudflare AI Gateway
- [ ] Restore multi-select behaviour for tag filter (currently selects only one tag at a time; toggle semantics via `addTag`/`removeTag` should allow multiple active)
- [ ] Weekly Digest backend — replace the placeholder paragraph in `src/components/weekly-digest.tsx` with real content. Decide source (server cron on D1 vs on-demand AI vs both) and meta line ("generated from N saves this week · updated X").
- [ ] Weekly Digest actions — add "✱ ask about this week" (seeds chat/chip) and "⎋ dismiss" with semantics (hide until tomorrow? forever? setting?). See [[todos/app-redesign]] phase 2 decisions.
- [ ] Keyboard hints footer in right pane — `⌘K · ⌥N · Esc` row beneath the digest. Confirm which three to promote.
- [ ] Time-grouped list headers (Today / Yesterday / This week / Older) — deferred from phase 2. Measure query impact before landing.
- [ ] Custom monogram fallback for image-less links — current fallback is the first domain letter on a muted square. Explore better options (generated gradient from domain hash, favicon upscale, brand-color map).
- [ ] Further list-mount perf improvements — see [[todos/app-redesign|redesign doc]] "Further list-mount perf" open question. Baseline 180ms longtask for 241 links on first route mount; Chrome profiling shows SQL is NOT the bottleneck (Livestore useQuery is 14ms). Leverage points if returning to this: flatten per-card DOM (currently 10+ fiber levels), query pagination with LIMIT + load-more, `startTransition` to chunk the longtask.

## In Progress

- [ ] [[todos/app-redesign|Rethink app design]] — phases 1 & 2 shipped; phase 3 (detail view + multi-select in right pane + animations) next
- [ ] [[todos/links-list-performance|Fix links list rendering performance at 150+ links]]
- [ ] GitHub-like grid of activity

## Done

- [ ] [[todos/publish-raycast-extension|Publish Raycast extension to Store]]
- [x] [[todos/surface-do-errors-monitoring|Surface LinkProcessorDO errors to monitoring]]
- [x] [[todos/queue-config-explicitness|Make queue config explicit in code]]
- [x] [[todos/logout-opfs-cleanup|Implement proper logout OPFS cleanup]]
- [x] [[todos/drop-livestore-common-cf-patch|Drop @livestore/common-cf patch after PR #1163 merges]]
- [x] [[todos/livestore-testing-data|Livestore data-layer tests (no UI)]]
- [x] Add concurrency (5 or so) to link processor DO
- [x] [[todos/done/usage-analytics-review|Review and improve usage analytics]]
- [x] [[todos/done/telegram-duplicate-message|AI summary re-request sends duplicate Telegram message]]
- [x] [[todos/done/restore-ws-ping|Restore frequent WebSocket ping + improve offline handling]]
- [x] Defuddle tool for page parsing
- [x] [[todos/done/browser-rendering-crawl|Improve data fetching with CF Browser Rendering crawl endpoint]]
- [x] [[todos/done/duplicate-tag-crash|Duplicate tag crashes Livestore + error handling + tests]]
- [x] [[todos/done/viteplus-migration|Complete Vite+ migration]]
- [x] [[todos/done/extract-db-effect-layer|Extract DB into Effect Layer]]
- [x] Add free PR review agent
- [x] [[todos/done/ai-summary-json-bug|Bug: AI summary returns plain JSON instead of formatted text]]
- [x] [[todos/done/html-entity-titles|Better title handling: decode HTML entities]]
- [x] [[todos/done/vite8-upgrade|Migrate to Vite 8 + upgrade dependencies]]
- [x] [[todos/done/telegram-streaming|Telegram streaming + bot config cleanup]]
- [x] [[todos/done/monorepo-conversion|Convert project to monorepo]]
- [x] [[todos/done/raycast-ingestion|Add Raycast ingestion path]]

%% kanban:settings

```
{"kanban-plugin":"board"}
```

%%
