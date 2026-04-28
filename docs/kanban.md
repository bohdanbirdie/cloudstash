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
- [ ] Weekly Digest backend — replace the placeholder paragraph in `src/components/weekly-digest.tsx` with real content. Decide source (server cron on D1 vs on-demand AI vs both) and meta line ("generated from N saves this week · updated X").
- [ ] Weekly Digest actions — add "✱ ask about this week" (seeds chat/chip) and "⎋ dismiss" with semantics (hide until tomorrow? forever? setting?). See [[todos/app-redesign]] phase 2 decisions.
- [ ] Keyboard hints footer in right pane — `⌘K · ⌥N · Esc` row beneath the digest. Confirm which three to promote.
- [ ] Time-grouped list headers (Today / Yesterday / This week / Older) — deferred from phase 2. Measure query impact before landing.
- [ ] Redesign phase 3b — multi-select in the right pane. Revive `src/stores/selection-store.ts` + `src/components/selection-toolbar.tsx` dead code. Add `selection` to the `RightPaneContext` state machine (home/detail/selection), active-row 12×12 accent checkmark, bulk actions (complete/archive/tag/export/clear), count + top-3 titles + "+N more", modifier hints. Reuse existing `ExportDialog` for export. Decide tag-applier behavior (picker popover with add/remove toggles), Esc priority (selection first → detail → home), cmd/shift-click semantics. **Build on the roving-tabindex foundation** from the list keyboard nav pass (`activeLinkId` + virtual selection on `<button role="option">` rows, `tabIndex` rovers between active and -1). Keyboard semantics: `shift+↑/↓` and `shift+j/k` extend the selection from the active row; `x` toggles the active row in/out; `cmd+a` selects all visible. Holding shift while clicking does range; cmd-click toggles. **Also resolve the layout collision** between `SelectionToolbar` (currently `fixed bottom-6 left-1/2 z-50`) and `CommandChip` (`fixed bottom-7 left-1/2 z-50`) — same spot, same z. If the new selection view lives inside the right pane per this phase, the standalone `SelectionToolbar` goes away and the collision disappears with it; confirm during revival.
- [ ] Activity grid → list filtering followup — cell click filters list to that day; multi-cell select (drag or shift-click) filters to a date range. Decide if range updates the URL (`?from=…&to=…`) or stays client-only.
- [ ] Further list-mount perf improvements — see [[todos/app-redesign|redesign doc]] "Further list-mount perf" open question. Baseline 180ms longtask for 241 links on **first route mount** (distinct from held-key nav perf, which landed separately — see Done). Chrome profiling shows SQL is NOT the bottleneck (Livestore useQuery is 14ms). Leverage points if returning to this: flatten per-card DOM (currently 10+ fiber levels), query pagination with LIMIT + load-more, `startTransition` to chunk the longtask.
- [ ] Virtualize the link list — TanStack Virtual or react-window. Per the keyboard-nav profiler session, `LinkList`'s parent body is ~5ms self per commit (rendering JSX for 240 rows + reconciler walking each fiber), inherent and not memo-fixable. **Trigger conditions** before doing this: p95 list length > 500 items OR a production-build trace shows nav/scroll lag attributable to LinkList. Interacts with: roving tabindex (only the row with `tabIndex=0` should be the first row in the visible window when no active row, so the first-row fallback in `tabbableId` needs to follow the window); hover-anchor (`onMouseOver` event delegation via `containerRef.current.contains` already handles unmounted rows correctly); the cursor `.focus()` call in `moveByKey` (must scroll the row into view if it's outside the rendered window). Don't take on without a measured trigger — meaningful refactor cost.
- [ ] Stabilize `DotsMenu` handler refs — profiler showed 4 Tooltips + 8 Buttons inside `DotsMenu` re-render with 100% prop changes per nav (228–456 renders each, ~3.78ms child time per nav commit). Wrap inline `() => setTagManagerOpen(true)`-style callbacks in `useCallback`, hoist tooltip strings, memoize `DropdownMenuContent` items. **Only do this** if a production-build trace (`bun run build && bun run preview`) still flags `DotsMenu` as hot — half of the dev-mode trace was profiler/jsxDEV overhead and may not survive the prod build. ~1 hour if it's still real.
- [ ] Review hit areas on the detail-view action cluster. `[` `]` nav, copy, external-link, `⋯`, and the `Complete` HotkeyButton are all ~28×28 (`icon-sm` / `size="sm"`), below the 40×40 accessibility floor. Keyboard-first brand accepts this visually, but hoverable pointer targets should still meet 40×40. Option: extend hit area via a `before:absolute before:inset-[-6px]` pseudo-element on each — keeps the 28px visual, adds the 40×40 effective hit box. Confirm no overlap between adjacent buttons in the cluster first.

## In Progress

- [ ] [[todos/app-redesign|Rethink app design]] — phases 1, 2, 3a, 3c, 4 (search-only) shipped; 3b (multi-select in right pane) and phase 4 follow-ups (agent mode, mobile, chat-sheet removal) pending
- [ ] [[todos/links-list-performance|Fix links list rendering performance at 150+ links]]

## Done

- [ ] [[todos/publish-raycast-extension|Publish Raycast extension to Store]]
- [x] Held-key keyboard nav perf — fixed 180ms-per-commit regression during arrow-held nav with detail open. Root cause: `links-page-layout.tsx` recreated `handleLinkClick`/`handleLinkActivate` on every `activeLinkId` change (had it in `useCallback` deps), breaking `React.memo` on all 240 rows. Pulled click/activate logic into `link-list.tsx` so handlers read latest `activeLinkId` via ref. Plus: `React.memo(DetailViewInner)` so the urgent commit bails when `useDeferredValue` returns the previous `linkId`; `useMemo(() => linkById$(deferredLinkId))` so livestore doesn't churn its subscription; `React.memo(Masthead)` + split into `MastheadMeta` child to isolate the four count subscriptions from the heavy h1; `React.memo(TagStrip)`; `enableOnFormTags: ["option"]` on every `useHotkeys` call so j/k/arrows/Esc fire when keyboard focus is on a `role="option"` row (the lib's default skip list includes `option`); roving tabindex with anchor ref + tabStop state; hover-blur to clear the focus ring when mouse takes over the cursor anchor; dropped the `requestAnimationFrame(() => element.focus())` in `closeDetail` that caused "page scrolls back to last clicked link." Final post-fix max commit ~45ms in dev (~50% is dev-mode overhead — `jsxDEV`, React DevTools profiler hooks). Pure helpers extracted to `src/lib/listbox-keyboard.ts` (`findRowInContainer`, `focusRowById`, `clearKeyboardFocusFromOtherRow`, `computeTargetIndex`) with 30 unit tests under `src/lib/__tests__/listbox-keyboard.test.ts`.
- [x] Rename "Trash" → "Archive" — route slug `/trash` → `/archive`, page title and meta copy ("X archived"), category nav, detail-view tag ("Archived"), chat confirmation copy, selection toolbar `isArchive` prop, internal queries (`archiveLinks$` / `archiveCount$` / `archiveProjection`), `LinkStatus` `"archive"`, icon registry. Livestore event names and the `deletedAt` schema column unchanged.
- [x] Image preview component — skeleton loading state with delayed fade-in (200ms), unified `ImageOff` fallback for failed/missing images, replaces inline image+monogram blocks in list rows and detail hero
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
