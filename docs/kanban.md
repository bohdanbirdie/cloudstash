---
kanban-plugin: board
---

## Todo

- [ ] [[todos/ws-close-scope-teardown-exception|SyncBackendDO webSocketClose throws on abnormal close (1006) — upstream teardown fix]] — 2 new `scriptThrewException` on the v4-cutover day (2026-08-10), zero in the prior week; benign (1ms, socket already dead, reconnect fine) but skips `serverCtxMap` cleanup and pollutes the error signal; small upstream PR candidate (make `Scope.close` teardown non-throwing in common-cf `ws-rpc-server.ts:217`).
- [ ] [[todos/simplify-link-processor-wake|Simplify LinkProcessorDO wake path — retire the manual onPush trigger]] — redundant for warm/cold re-wake since upstream #1541–#1545 (KV-persisted `rpc-sub:` registry + store-less `syncUpdateRpc` recovery); still needed as first-subscribe bootstrap + cutover registry backfill. Pick up after the migration soaks in prod.
- [ ] Account-deletion purge ordering: purge SyncBackendDO **before** LinkProcessorDO/ChatAgentDO — the workflow currently wipes client DOs while the sync backend is still alive, and the upstream always-recover `syncUpdateRpc` contract (landed via [[todos/effect-v4-livestore-upstream-migration]]) lets a late live-pull delivery wake a just-purged client DO and reload its store mid-deletion. Pre-existing race, window widened by the recovery wiring. Fix = reorder steps in `src/cf-worker/account-deletion/workflow.ts`; details in the migration tracker's Found issues (2026-08-10).
- [ ] [[todos/server-ingest-cold-do-stranding|Server ingest stranded on a cold LinkProcessorDO — link doesn't sync until the next push]] — Telegram/Raycast/API ingest commits `linkCreatedV2` to the LinkProcessorDO's **local** store but the fire-and-forget push to SyncBackend dies on eviction, so the link is absent from the server (UI + refresh show nothing) until the next ingest re-boots the DO and flushes the backlog. Confirmed in prod 2026-06-24 22:19–22:22 UTC (two Telegram links flushed together; `ingestAndProcess completed`=0). Account healthy — delay, not loss (distinct from server-ingest-durability). **DEFERRED (2026-08-08):** fix drafted (`whenLeaderSynced` barrier) + e2e-validated, then reverted pending the livestore version bump that may obviate it. Post-mortem + skipped e2e reproduction kept. **Re-check the push-side durability after the bump** — the merged upstream #1541/#1542/#1545 fix the pull side (reverse-RPC survival), NOT this outbound-push strand. Re-confirmed 2026-08-09: nothing on upstream `main` addresses the outbound push; durable fix = upstream commit-receipt awaitables (livestorejs#722), a contribution candidate once [[todos/effect-v4-livestore-upstream-migration]] lands.
- [ ] [[todos/effect-v4-livestore-upstream-migration|Effect v4 migration + LiveStore submodule swap → upstream main]] — THE unblock for the contributor loop: the fork's 4 commits are fully superseded upstream, but upstream `main` runs `effect 4.0.0-beta.99` vs our `3.21.2` (177 src files import effect), so the submodule swap and the app migration must land together. De-riskers verified 2026-08-09: matching published snapshot exists (`0.0.0-snapshot-2e4bcfc68…` = main HEAD), package `exports` still point at `src/*.ts` (alias mechanism survives), `@effect/rpc` patch dies with the swap. Staged plan in doc.
- [ ] [[todos/local-mock-ingest-tui|Local mock-ingest TUI — endless fake links for testing the ingest API]] — personal dev tool: a background bun mock content server (serves unique, locally-fetchable pages so each ingest is a genuinely new link, no dedup) + a zero-dep TUI to send 1 / 10 / 50 / 500 links over `POST /api/ingest`. For exercising durability/sync + burst at volume without hunting real URLs.
- [ ] Set up a staging environment on Cloudflare (future) — a separate deployed env (its own DOs, D1, queues, KV, R2, and SyncBackend/LinkProcessor namespaces) to validate DO eviction / hibernation-billing / livestore-fork / cross-DO sync changes against **real** Cloudflare infra before prod, since `wrangler dev`/Miniflare can't fully reproduce idle DO eviction, hibernation GB-s, or cross-DO sync timing. Would give work like cold-DO-stranding and the hibernation patches a real on-device test bed instead of prod. Decide: wrangler `env.staging` in `wrangler.jsonc` vs a separate Worker; data isolation + seed/auth strategy; how it coexists with the "NEVER run remote wrangler" rule (likely a dedicated CI/deploy path, not local).
- [ ] [[todos/admin-server-ahead-alert|Admin alert for stuck LinkProcessorDO sync (Telegram via Tail Worker)]]
- [ ] Remove the temp `liveLongTimers` probe (`src/cf-worker/sync/index.ts:23`) once prod `type:hibernation` GB-s are re-confirmed after the v4-cutover deploy — last remainder of [[architecture/sync-backend-do-hibernation-billing]]. LinkProcessorDO client-side hibernation stays deferred (needs a clean-store re-test, not a new patch).
- [ ] [[todos/livestore-testing-ui|Livestore UI feature tests (RTL)]]
- [ ] [[todos/progress-tracker-sqlite-review|Review stateful SQLite ProgressTracker]]
- [ ] [[todos/managed-effect-runtime-do|Explore ManagedRuntime for LinkProcessorDO]]
- [ ] Develop CLI for ingestion and management
- [ ] Review and consolidate rate limiting / usage limits
- [ ] [[todos/develop-mcp-server|Develop MCP server (pro-only capability)]]
- [ ] iOS Shortcut as injection source
- [ ] Use Cloudflare Email instead of Resend
- [ ] AI summary 30s timeout when the primary model hangs on certain content — repro: paste `https://typeonce.dev` (failed twice, 2026-06-15, identical 1712-char content → `AiCallError / TimeoutException 30s`). The hard `Effect.timeout("30 seconds")` wraps the _whole_ generate (`src/cf-worker/link-processor/services/ai-summary-generator.live.ts:19`), so a **hanging** primary (gemini via OpenRouter) consumes the entire budget and the Workers-AI fallback never runs. Note: **fail-fast** primaries DO fall back fine (observed `AI_NoObjectGeneratedError` → llama success), so the gap is specifically a hang, not an error. Fix: per-attempt timeout on the primary so a hang still leaves budget for the fallback; verify against the typeonce.dev example. General case worth checking — likely affects other slow/large pages.
- [ ] Replace OpenRouter with Cloudflare AI Gateway
- [ ] [[todos/agent-context-chips-entry-points|Agent context chips + entry points]]
- [ ] Shrink Worker output further — current upload is 2421 KiB gzipped (deploy 2026-05-13), only 633 KiB headroom under the 3 MiB free-tier cap. Two levers worth evaluating before the budget gets tight again: (a) split into separate Workers (web/assets vs. API/DOs) joined by a service binding, so each subsystem gets its own 3 MiB; (b) trim heavy chunks in place — defuddle/linkedom/htmlparser2 (HTML readability in LinkProcessorDO), @ai-sdk/react + livestore client on the authed entry, Effect tracer surface. Decide which lever first based on what's growing.
- [ ] [[todos/multi-chat-architecture|Multi-chat architecture (separate DOs + central livestore)]]
- [ ] Extend Pro plan with twitter historical sync of bookmarks

## In Progress

- [ ] [[todos/server-ingest-durability|Server-side ingest durability — links lost when DO backend is disabled]] — **fix implemented 2026-08-12** on `feat/ingest-dlq-drain` (queue-only, D1 ledger rejected): main-queue backoff 30s→480s ×5, new `cloudstash-link-dlq` re-drive consumer (hourly ×24 then 4h, ×100, ~14d), error-level tripwire log, safe `retryAll()` dispatcher fallback. Pending: review, deploy, then the one-time remote retention bump to 14d (command in doc).
- [ ] [[todos/chat-approval-needsapproval|Migrate chat approval to server-side needsApproval (drop deprecated toolsRequiringConfirmation)]]
- [ ] [[todos/chrome-extension|Develop Chrome extension (Livestore-as-client)]] — built + working locally (popup save + recent + avatar/favicons, sync via paired API key), now FREE (no paywall). Remaining: publishing only — [[chrome-extension-publishing|store listing, screenshots, privacy form]].
- [ ] ⌘Z undo for reversible events — wire keyboard undo to events that have a clean inverse (link archive/unarchive, tag add/remove, link tagging, status change, delete). Maintain a small client-side undo stack of the last N user-driven mutations; ⌘Z commits the inverse event. Skip events that are not safely invertible (snapshot/summary writes, sync events).
- [ ] Decouple tag search from id format — `TagCombobox` filters tags via `tag.id.includes(sanitizeTagName(input))`, which only works because ids are slug-of-name. If id format ever changes (UUIDs, prefixes), search silently breaks. Switch to `tag.name.toLowerCase().includes(input.toLowerCase().trim())` and reserve `sanitizeTagName` for `deriveNewTag`. Verify behavior for names containing dashes.
- [ ] [[todos/consolidated-paywall|Consolidated paywall / upgrade system (app-wide)]] — **UX design locked 2026-06-09** (marketer brief + competitor isolated-modal). One trigger, many doors: `openPaywall()` → **dedicated isolated modal** (Dialog desktop / `vaul` sheet mobile), state in a Zustand store, **not** a route — a one-shot `?upgrade[=tier]` link trigger opens it then strips the param. Yearly pre-selected + struck price + Best-value/Most-popular tags + BIG buttons. Modal = acquisition; Settings → Plan keeps management; shared `PlanCards` core; repoint `UpgradeCta`/promos. Landing "Start Pro" → `/login` (`callbackURL:"/inbox?upgrade=pro"`) → modal pre-highlighted. $50/$120 are already-discounted Stripe prices (no coupon lever). Billing/Stripe plumbing untouched. Still-open: modal scope, sidebar-per-tier, card layout, soft-gate threshold, instrumentation. See doc.
- [ ] [[todos/link-notes|Notes on links (user-authored, agent-aware)]]
- [ ] [[todos/initial-sync-blocking|Make sync blocking]] — with 1400 links the sync happens post-render and causes confusion and delays. Root-caused 2026-06-24 (fresh-client full-eventlog replay; lever = `livestore.worker.ts` `initialSyncOptions` timeout). See doc.

## Done

- [x] [[todos/e2e-do-sync-testing|E2E testing for DO-to-DO sync]] — PR #46 merged 2026-08-10 (`e278fd1`): 12 miniflare tests over the ingest surface + suite-wide teardown-flake fix (`disableConsoleIntercept: true`). PR #83 (`9e83203`): sync-arrival suite — events asserted to actually reach SyncBackendDO's persisted eventlog (single / concurrent / queue-batch) + eviction survival with cold-boot re-sync. Residual scope (cross-client WS pull, concurrency semantics) recorded in the doc — gated on a livestore test client / hermetic AI stub.
- [x] [[todos/link-processor-stuck-after-eviction|LinkProcessor: self-heal after DO eviction]] — fixed upstream by #1544/#1545, landed here via the v4/upstream swap (PR #82); verified post-cutover, no recurrence. The v3-fork backport contingency is dead.
- [x] [[architecture/livestore-do-rpc-stream-stall|Upstream livestore PR — DO-RPC stream-framing fix]] — obsolete: drain-then-decode merged upstream as #1167 (2026-04) and the DO-RPC/ws-rpc layer was reworked wholesale for Effect v4; no repro on upstream `main` after the swap.
- [x] [[architecture/sync-backend-do-hibernation-billing|DO-hibernation upstreaming + fork retirement]] — upstream `main` carries the full fix chain (#1328 closed, guarded by our test PRs #1427/#1435; DO-RPC recovery via #1541/#1542/#1544/#1545); fork retired via [[todos/effect-v4-livestore-upstream-migration]] (PR #82). `liveLongTimers` probe removal split out as its own Todo.
- [x] [[todos/livestore-0.4.0-upgrade|Upgrade LiveStore snapshot → v0.4.0 stable]] — obsolete (2026-08-09): superseded by the vendored-fork submodule (PR #79); the published `@livestore/*` pins now only serve types/wasm/the A-B hatch and get bumped as part of [[todos/effect-v4-livestore-upstream-migration]].
- [x] [[todos/get-links-api|GET links API + in-app API reference]] — `GET /api/links` (cursor-paginated, API-key auth via `ChatAgentDO.listLinks` RPC; tags = accepted + pending suggestions) shipped + gated to Plus+ at request time + verified live. Plus an **API Reference** card in Settings → Integrations (paywalled in UI): documents `GET /api/links` + `POST /api/ingest` with params/response/errors, copyable curl per endpoint, and a **Copy for agents** button that copies a full self-contained markdown spec. Single source of truth in `api-spec.ts` drives both the rendered UI and the agent blob; unit-tested.
- [x] Add real Chrome Web Store install link — published listing is now live at `https://chromewebstore.google.com/detail/cloudstash/bdommhffamndfanbpnikgmpjncpcobia`. Promoted `CHROME_WEB_STORE_URL` to `src/lib/extension-connect.ts` (built from `PUBLISHED_EXTENSION_ID` + slug), consumed by `extension-card.tsx` and the `not_installed` state on `/connect/extension`, which now shows a primary "Install from the Chrome Web Store" CTA above the retry button.
- [x] Env-var cleanup in `src/cf-worker/shared.ts` — `EMAIL_FROM` moved into `wrangler.jsonc` `vars` so `cf-typegen` emits it on `Cloudflare.Env`; `PUBLIC_URL` kept as a custom-`Env` optional (both consumers — Telegram webhook URL and Stripe checkout return URL — have request-origin fallbacks, and the value isn't pinned in prod today). End state: `Env` = `LINK_QUEUE` + 3 optionals (`ENABLE_TEST_AUTH`, `GOOGLE_BASE_URL`, `PUBLIC_URL`).
- [ ] [[todos/weekly-digest-backend|Weekly Digest backend]]
- [ ] Bug: accepting a suggested tag stutters the app — committing the tag re-renders the header tag strip, which looks like a heavy operation. Profile the accept path; likely the tag-strip recompute (counts/ordering across all links) runs synchronously on the same commit. Decouple or memoize so accepting a tag doesn't block the frame.
- [x] [[todos/x-content-sub-processing|X (twitter) content enrichment — Pro feature]] — Pro-only enriched AI summaries for x.com bookmarks, hard-capped at 100/org/mo, with image fallback so quoting tweets render a card image
- [ ] Review and develop Twitter integrations (https://x.com/mynameistito/status/2046213790623301955)
- [ ] [[todos/mobile-view-review|Mobile view review + fixes]]
- [x] [[architecture/livestore-do-rpc-stream-stall|Livestore DO-RPC stream stall — root cause, fix, postmortem]]
- [ ] [[todos/mobile-settings-polish|Mobile settings polish — delete flow, Connections overhaul, tab look]]
- [x] AI summary should not block the metadata fetching — obsolete (verified 2026-08-11): the pipeline commits `linkMetadataFetched` right after the fetch and before the AI block (`process-link.ts`), so metadata reaches the UI independent of AI timing.
- [ ] [[todos/telegram-login-link|Simplify Telegram bot auth with login link]]
- [x] Landing page — TanStack Start SSR landing on `/` with hero/pitch/integrations/benefits/pricing/FAQ/closer/footer; SEO hardening (canonical, OG, JSON-LD SoftwareApplication + FAQPage, sitemap.xml, robots.txt, noindex on /login)
- [x] User settings modal (UI) — wired the disabled "Settings" item in the account menu, surfaces full name + email, plan placeholder, danger-zone Delete account with type-DELETE confirmation. Backend deletion split out as its own task (see Account deletion above).
- [x] Replace hand-rolled `InputOTP` with shadcn's `input-otp`-backed component — current `src/components/ui/input-otp.tsx` is a custom implementation skipped during the base-mira refresh. Adopt the registry version (adds `input-otp` dep, exposes `InputOTPGroup`/`InputOTPSlot`/`InputOTPSeparator`) and migrate `pending-approval.tsx` to the compose API.
- [ ] AI summary loading messages like in agents, eg swap phrases
- [ ] Improve UX of tags strip, maybe add counters and exclude tags that are unused on the specific page
- [ ] Let LLM suggest more tags from existing ones. Respect domains for tags as a fallback
- [ ] Legal pages — followups before launch. Privacy + ToS content shipped on `redesign`. Remaining: Termly cross-check, decide Meta Pixel fate (geo-gate / banner / remove), arbitration vs litigation decision (lawyer call), DMCA agent registration, Stripe checkout consent.
- [x] [[todos/links-list-performance|Fix links list rendering performance at 150+ links]] — resolved in the keyboard-nav perf session (per-row memo, list-level query Maps, deferred detail pane, TagStrip/Masthead subscription isolation). Virtualization stays in reserve with its trigger (p95 list > 500 or prod trace flags `LinkList`) recorded in the doc.
- [ ] [[todos/publish-raycast-extension|Publish Raycast extension to Store]]
- [ ] [[todos/further-list-mount-perf|Further list-mount perf improvements]]
- [ ] Reduce monospace font usage — JetBrains Mono is currently `--font-sans` for the entire app. Pair a refined sans for body/UI and reserve mono for tokens that earn it (counts, tags, timestamps, dock input).
- [ ] Connections modal revamp — current implementation is outdated and complicated. Rethink IA/UX for managing per-user integrations (Telegram, Raycast, API keys); simplify each flow, clarify "connection" vs "API key" framing, and consider how it relates to the new Settings entry point.
- [x] Right-pane summary UI redesign — small-caps SUMMARY/TAGS eyebrows replacing icon-above-heading; page description as italic pullquote with em-dash attribution; inline dot-matrix loader (`dotm-square-11`) next to SUMMARY during processing/reprocessing with `AnimatePresence` enter/exit; "Reading the page…" replacing the shimmer placeholder; 300ms blur-in for summary changes (with `prefers-reduced-motion` respect); CheckIcon for Completed status; redundant hairline divider dropped; title weight dialed back from `text-3xl extrabold tracking-tight` to `text-2xl bold`
- [ ] [[todos/account-deletion|Account deletion (backend + workflow)]] — backend code complete and tested (30 unit tests, lint/typecheck/Effect-LS all clean). Remaining: generate D1 migration, manual e2e test, resolve Telegram chat_id resolution (Open Q1). See doc for details.
- [ ] Improve link-card UI for failed/error fetches (404, 5xx, Cloudflare bot challenge, login walls). Today the row shows a near-empty card with the URL only. Surface the failure state explicitly (status code or category), keep the URL prominent so the user can verify, and offer a clear "retry" affordance distinct from regular reprocess. Affects link-list rows and the right-pane detail view.
- [ ] Clenaup createStoreInternal
- [x] Gate all agent UI on per-user feature flag — `isChatEnabled` (from `useOrgFeatures`) gates `AgentChatProvider`/connection mount; AgentTrigger + ⌘J intentionally remain wired to surface the paywall/promo placeholder for non-enabled users.
- [ ] Make link list items even more vertically compact — tighten vertical padding/line-height in the list rows so more items fit on screen. As part of this, rework the row's processing visuals (currently `BorderTrail`) so the in-flight AI-summary state reads clearly at the new density and is distinguishable from idle and failed.
- [ ] Pop-animate newly added link items in the list — when a link is added via the UI or arrives via livestore sync, animate its entry into the list. Must NOT animate on filter/category changes (only genuinely new items). Likely needs to track "seen" ids and only animate ones that weren't in the previous result set.
- [ ] Restore hotkey-tip overlays when modifier keys are held — when ⌘ (or ⌥/Ctrl/Shift) is pressed, surface contextual hotkey hints next to the actions they trigger (e.g. ⌘V on the Add link button, ⌘K on the dock pill, ⌘J on the agent button, etc.). Was previously implemented; should be reintroduced with the new dock + top-bar layout.
- [x] Link generation fails locally after redesign — switched from JSON-mode (`Output.object`) to forced tool-calling pattern, upgraded `workers-ai-provider` 3.1.5→3.1.14 (vLLM `toolChoice` mismapping fix), settled on `@cf/meta/llama-3.3-70b-instruct-fp8-fast` for reliable schema adherence (IFEval 92.1, BFCL 77.3)
- [x] Tag combobox redesign — Linear-style multi-select, dual click targets, frozen alphabetic ordering, deferred close-frame cleanup
- [x] Tag manager modal rebuild — opaque dropdown, full-width row click target with pencil affordance, tag validation, modal lifecycle
- [x] ActivityGrid render-cost cut — memoize cell/month/day element arrays so the ~400 React.createElement calls don't fire on unrelated commits (≈25× drop in self-time per render)
- [x] Reprocess button is admin-only now (no longer surfaced to users without AI summary enabled)
- [x] Free-text dock search now matches tag names — added `EXISTS` against `link_tags`/`tags` to each word condition + a score band (80, between title and domain). No `#tag` syntax needed; abstract tags (`to-read`, `wip`) become findable.
- [x] Failed-summary state — accepted current behavior; no dedicated retry affordance needed
- [x] Scope `j`/`k` link navigation hotkeys away from inputs — hotkey handler now checks active element before treating `j`/`k` as link nav
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
