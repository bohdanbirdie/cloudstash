---
kanban-plugin: board
---

## Todo

- [ ] [[todos/link-processor-stuck-after-eviction|LinkProcessor: self-heal after DO eviction]]
- [ ] [[todos/admin-server-ahead-alert|Admin alert for stuck LinkProcessorDO sync (Telegram via Tail Worker)]]
- [ ] [[architecture/livestore-do-rpc-stream-stall|Upstream livestore PR — DO-RPC stream-framing fix (drain-then-decode + return runStream)]]
- [ ] [[todos/e2e-do-sync-testing|E2E testing for DO-to-DO sync]]
- [ ] [[todos/livestore-0.4.0-upgrade|Upgrade LiveStore snapshot → v0.4.0 stable]] — reviewed; low-risk (we already run all v0.4.0 breaking changes, effect doesn't move, patch verified to still apply). Blocked only by the 7-day cooldown — install on/after 2026-06-09.
- [ ] [[todos/livestore-testing-ui|Livestore UI feature tests (RTL)]]
- [ ] [[todos/progress-tracker-sqlite-review|Review stateful SQLite ProgressTracker]]
- [ ] [[todos/managed-effect-runtime-do|Explore ManagedRuntime for LinkProcessorDO]]
- [ ] Develop CLI for ingestion and management
- [ ] Review and consolidate rate limiting / usage limits
- [ ] [[todos/develop-mcp-server|Develop MCP server (pro-only capability)]]
- [ ] iOS Shortcut as injection source
- [ ] Use Cloudflare Email instead of Resend
- [ ] Replace OpenRouter with Cloudflare AI Gateway
- [ ] [[todos/agent-context-chips-entry-points|Agent context chips + entry points]]
- [ ] Shrink Worker output further — current upload is 2421 KiB gzipped (deploy 2026-05-13), only 633 KiB headroom under the 3 MiB free-tier cap. Two levers worth evaluating before the budget gets tight again: (a) split into separate Workers (web/assets vs. API/DOs) joined by a service binding, so each subsystem gets its own 3 MiB; (b) trim heavy chunks in place — defuddle/linkedom/htmlparser2 (HTML readability in LinkProcessorDO), @ai-sdk/react + livestore client on the authed entry, Effect tracer surface. Decide which lever first based on what's growing.
- [ ] [[todos/multi-chat-architecture|Multi-chat architecture (separate DOs + central livestore)]]
- [ ] Extend Pro plan with twitter historical sync of bookmarks

## In Progress

- [ ] [[todos/chat-approval-needsapproval|Migrate chat approval to server-side needsApproval (drop deprecated toolsRequiringConfirmation)]]
- [ ] [[todos/chrome-extension|Develop Chrome extension (Livestore-as-client)]] — built + working locally (popup save + recent + avatar/favicons, sync via paired API key), now FREE (no paywall). Remaining: publishing only — [[chrome-extension-publishing|store listing, screenshots, privacy form]].
- [ ] ⌘Z undo for reversible events — wire keyboard undo to events that have a clean inverse (link archive/unarchive, tag add/remove, link tagging, status change, delete). Maintain a small client-side undo stack of the last N user-driven mutations; ⌘Z commits the inverse event. Skip events that are not safely invertible (snapshot/summary writes, sync events).
- [ ] Decouple tag search from id format — `TagCombobox` filters tags via `tag.id.includes(sanitizeTagName(input))`, which only works because ids are slug-of-name. If id format ever changes (UUIDs, prefixes), search silently breaks. Switch to `tag.name.toLowerCase().includes(input.toLowerCase().trim())` and reserve `sanitizeTagName` for `deriveNewTag`. Verify behavior for names containing dashes.
- [ ] [[todos/consolidated-paywall|Consolidated paywall / upgrade system (app-wide)]]
- [ ] [[todos/link-notes|Notes on links (user-authored, agent-aware)]]
- [ ] Add GET links API

## Done

- [x] Add real Chrome Web Store install link — published listing is now live at `https://chromewebstore.google.com/detail/cloudstash/bdommhffamndfanbpnikgmpjncpcobia`. Promoted `CHROME_WEB_STORE_URL` to `src/lib/extension-connect.ts` (built from `PUBLISHED_EXTENSION_ID` + slug), consumed by `extension-card.tsx` and the `not_installed` state on `/connect/extension`, which now shows a primary "Install from the Chrome Web Store" CTA above the retry button.
- [x] Env-var cleanup in `src/cf-worker/shared.ts` — `EMAIL_FROM` moved into `wrangler.jsonc` `vars` so `cf-typegen` emits it on `Cloudflare.Env`; `PUBLIC_URL` kept as a custom-`Env` optional (both consumers — Telegram webhook URL and Stripe checkout return URL — have request-origin fallbacks, and the value isn't pinned in prod today). End state: `Env` = `LINK_QUEUE` + 3 optionals (`ENABLE_TEST_AUTH`, `GOOGLE_BASE_URL`, `PUBLIC_URL`).
- [ ] [[todos/weekly-digest-backend|Weekly Digest backend]]
- [ ] Bug: accepting a suggested tag stutters the app — committing the tag re-renders the header tag strip, which looks like a heavy operation. Profile the accept path; likely the tag-strip recompute (counts/ordering across all links) runs synchronously on the same commit. Decouple or memoize so accepting a tag doesn't block the frame.
- [x] [[todos/x-content-sub-processing|X (twitter) content enrichment — Pro feature]] — Pro-only enriched AI summaries for x.com bookmarks, hard-capped at 100/org/mo, with image fallback so quoting tweets render a card image
- [ ] Review and develop Twitter integrations (https://x.com/mynameistito/status/2046213790623301955)
- [ ] [[todos/mobile-view-review|Mobile view review + fixes]]
- [x] [[architecture/livestore-do-rpc-stream-stall|Livestore DO-RPC stream stall — root cause, fix, postmortem]]
- [ ] [[todos/mobile-settings-polish|Mobile settings polish — delete flow, Connections overhaul, tab look]]
- [ ] AI summary should not block the metadata fetching
- [ ] [[todos/telegram-login-link|Simplify Telegram bot auth with login link]]
- [x] Landing page — TanStack Start SSR landing on `/` with hero/pitch/integrations/benefits/pricing/FAQ/closer/footer; SEO hardening (canonical, OG, JSON-LD SoftwareApplication + FAQPage, sitemap.xml, robots.txt, noindex on /login)
- [x] User settings modal (UI) — wired the disabled "Settings" item in the account menu, surfaces full name + email, plan placeholder, danger-zone Delete account with type-DELETE confirmation. Backend deletion split out as its own task (see Account deletion above).
- [x] Replace hand-rolled `InputOTP` with shadcn's `input-otp`-backed component — current `src/components/ui/input-otp.tsx` is a custom implementation skipped during the base-mira refresh. Adopt the registry version (adds `input-otp` dep, exposes `InputOTPGroup`/`InputOTPSlot`/`InputOTPSeparator`) and migrate `pending-approval.tsx` to the compose API.
- [ ] AI summary loading messages like in agents, eg swap phrases
- [ ] Improve UX of tags strip, maybe add counters and exclude tags that are unused on the specific page
- [ ] Let LLM suggest more tags from existing ones. Respect domains for tags as a fallback
- [ ] Legal pages — followups before launch. Privacy + ToS content shipped on `redesign`. Remaining: Termly cross-check, decide Meta Pixel fate (geo-gate / banner / remove), arbitration vs litigation decision (lawyer call), DMCA agent registration, Stripe checkout consent.
- [ ] [[todos/links-list-performance|Fix links list rendering performance at 150+ links]]
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
