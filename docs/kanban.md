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
- [ ] [[todos/weekly-digest-backend|Weekly Digest backend]]
- [ ] [[todos/weekly-digest-actions|Weekly Digest actions]]
- [ ] Keyboard hints footer in right pane — `⌘K · ⌥N · Esc` row beneath the digest. Confirm which three to promote.
- [ ] Time-grouped list headers (Today / Yesterday / This week / Older) — deferred from phase 2. Measure query impact before landing.
- [ ] [[todos/tag-text-colors|Per-tag text colors]]
- [ ] [[todos/further-list-mount-perf|Further list-mount perf improvements]]
- [ ] [[todos/virtualize-link-list|Virtualize the link list]]
- [ ] [[todos/stabilize-dots-menu-refs|Stabilize DotsMenu handler refs]]
- [ ] [[todos/agent-context-chips-entry-points|Agent context chips + entry points]]
- [ ] [[todos/mobile-view-review|Mobile view review + fixes]]
- [ ] Support `#tag` search in the bottom-dock search panel — typing `#` should suggest tags from the workspace and filter by them, complementing free-text search.
- [ ] Reduce monospace font usage — JetBrains Mono is currently `--font-sans` for the entire app. Pair a refined sans for body/UI and reserve mono for tokens that earn it (counts, tags, timestamps, dock input).
- [ ] Gate all agent UI on per-user feature flag — when agent is not enabled for a user: hide the AgentTrigger in the dock, ignore the `⌘J` hotkey, skip mounting `AgentChatProvider`/connection, and remove "agent" from any mode switching. Single capability check, applied everywhere.
- [ ] Replace hand-rolled `InputOTP` with shadcn's `input-otp`-backed component — current `src/components/ui/input-otp.tsx` is a custom implementation skipped during the base-mira refresh. Adopt the registry version (adds `input-otp` dep, exposes `InputOTPGroup`/`InputOTPSlot`/`InputOTPSeparator`) and migrate `pending-approval.tsx` to the compose API.
- [ ] Restore hotkey-tip overlays when modifier keys are held — when ⌘ (or ⌥/Ctrl/Shift) is pressed, surface contextual hotkey hints next to the actions they trigger (e.g. ⌘V on the Add link button, ⌘K on the dock pill, ⌘J on the agent button, etc.). Was previously implemented; should be reintroduced with the new dock + top-bar layout.
- [ ] Pop-animate newly added link items in the list — when a link is added via the UI or arrives via livestore sync, animate its entry into the list. Must NOT animate on filter/category changes (only genuinely new items). Likely needs to track "seen" ids and only animate ones that weren't in the previous result set.
- [ ] Redesign tag combobox/dropdown — current dropdown looks bad, especially with longer tag names. Research best-practice tag-input patterns (truncation, wrapping, max width per chip) and pick a reasonable max tag length. Update both the input chips and the suggestion list.
- [ ] Make link list items even more vertically compact — tighten vertical padding/line-height in the list rows so more items fit on screen without sacrificing scan-ability.

## In Progress

- [ ] [[todos/app-redesign|Rethink app design]]
- [ ] [[todos/links-list-performance|Fix links list rendering performance at 150+ links]]

## Done

- [ ] [[todos/publish-raycast-extension|Publish Raycast extension to Store]]
- [x] [[todos/done/redesign-phase-3b-multi-select|Redesign phase 3b — multi-select]]
- [x] [[todos/done/held-key-nav-perf|Held-key keyboard nav perf]]
- [x] [[todos/done/rename-trash-to-archive|Rename "Trash" → "Archive"]]
- [x] [[todos/done/image-preview-component|Image preview component]]
- [x] GitHub-like grid of activity
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
