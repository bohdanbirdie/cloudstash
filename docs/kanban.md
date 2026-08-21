---
kanban-plugin: board
---

## Near-term Technical Outcomes

- [ ] [[todos/raycast-capability-source-cleanup|Align Raycast source and entitlement semantics]] — publication is complete; preserve first-party attribution and use one operation-time contract.
- [ ] [[todos/customer-facing-copy-accuracy|Align customer-facing copy with shipped behavior]] — reconcile product, repository, SEO, integration, Terms, and policy surfaces with executable capabilities and current availability.
- [ ] [[todos/canonical-url-identity|Canonical URL identity across every capture path]] — prevent new duplicates first; historical reconciliation remains a separate decision.
- [ ] Complete deletion data lifecycle and minimize telemetry — [[todos/account-deletion|reliable account deletion]] plus [[todos/telemetry-minimization|purpose-bound collection]].
- [ ] [[todos/paid-capability-enforcement|Enforce paid capabilities and budgets at operation time]] — current access/capability at authoritative operations, atomic cost controls, and safe long-lived-session revocation.
- [ ] [[todos/admin-purchase-attribution|Extend admin purchase attribution]] — bounded aggregate funnel evidence in the existing dashboard.
- [ ] [[todos/free-ai-summary-allowance|Plan a bounded Free AI-summary allowance]] — saved-link count remains unlimited; exhaustion preserves the link.
- [ ] [[todos/initial-sync-blocking|Research large-Vault bootstrap]] — benchmark WebSocket vs supported HTTP replay, BootStatus/timeout UX, and upstream snapshot-at-head feasibility.
- [ ] [[todos/automatic-summary-recovery|Recover failed summaries automatically]] — bounded primary, fallback, limited automatic retry, then a calm terminal state.

## Todo

- [ ] Retire the local Better Auth MCP JWKS verifier after [#10856](https://github.com/better-auth/better-auth/issues/10856) / [#10888](https://github.com/better-auth/better-auth/issues/10888) and [#10893](https://github.com/better-auth/better-auth/pull/10893) ship in a stable release — installed types must accept an in-process JWKS source plus cache key, and the same-Worker E2E must pass with zero outbound JWKS requests.
- [ ] Retest Better Auth OAuth resource seeding on future stable upgrades — the Drizzle-wrapped UNIQUE race is independently reproduced on 1.7.0 and still present upstream; keep the app-wide atomic initializer in `AuthClientLive` until concurrent fresh auth contexts pass without it. No upstream issue is being filed.
- [ ] [[todos/ws-close-scope-teardown-exception|SyncBackendDO webSocketClose throws on abnormal close (1006) — upstream teardown fix]] — 2 new `scriptThrewException` on the v4-cutover day (2026-08-10), zero in the prior week; benign (1ms, socket already dead, reconnect fine) but skips `serverCtxMap` cleanup and pollutes the error signal; small upstream PR candidate (make `Scope.close` teardown non-throwing in common-cf `ws-rpc-server.ts:217`).
- [ ] [[todos/simplify-link-processor-wake|Simplify LinkProcessorDO wake path — retire the manual onPush trigger]] — redundant for warm/cold re-wake since upstream #1541–#1545 (KV-persisted `rpc-sub:` registry + store-less `syncUpdateRpc` recovery); still needed as first-subscribe bootstrap + cutover registry backfill. Pick up after the migration soaks in prod.
- [ ] Remove the temp `liveLongTimers` probe (`src/cf-worker/sync/index.ts:23`) once prod `type:hibernation` GB-s are re-confirmed after the v4-cutover deploy — last remainder of [[architecture/sync-backend-do-hibernation-billing]]. LinkProcessorDO client-side hibernation stays deferred (needs a clean-store re-test, not a new patch).
- [ ] [[todos/livestore-testing-ui|Livestore UI feature tests (RTL)]]
- [ ] [[todos/progress-tracker-sqlite-review|Review stateful SQLite ProgressTracker]]
- [ ] [[todos/managed-effect-runtime-do|Explore ManagedRuntime for LinkProcessorDO]]
- [ ] Develop CLI for ingestion and management
- [ ] Use Cloudflare Email instead of Resend
- [ ] Replace OpenRouter with Cloudflare AI Gateway
- [ ] [[todos/pro-larger-summary-model|Give Pro summaries a larger model]] — choose the quality/cost boundary, fallback behavior, and operation-time entitlement; advertise it only after it ships.
- [ ] [[todos/agent-context-chips-entry-points|Agent context chips + entry points]]
- [ ] [[todos/multi-chat-architecture|Multi-chat architecture + align chat tools with canonical link RPCs]] — keep each conversation DO lightweight and move link tools behind the same workspace RPC capability used by API/MCP.
- [ ] Extend Pro plan with twitter historical sync of bookmarks
- [ ] [[todos/weekly-digest-backend|Weekly Digest backend]]
- [ ] Bug: accepting a suggested tag stutters the app — profile the accept path and decouple or memoize the synchronous tag-strip count/order recompute.
- [ ] Review and develop Twitter integrations (https://x.com/mynameistito/status/2046213790623301955)
- [ ] [[todos/mobile-view-review|Mobile view review + fixes]]
- [ ] [[todos/mobile-settings-polish|Mobile settings polish — delete flow, Connections overhaul, tab look]]
- [ ] [[todos/telegram-login-link|Simplify Telegram bot auth with login link]]
- [ ] AI summary loading messages like in agents, eg swap phrases
- [ ] Improve UX of tags strip, maybe add counters and exclude tags that are unused on the specific page
- [ ] Let LLM suggest more tags from existing ones. Respect domains for tags as a fallback
- [ ] [[todos/further-list-mount-perf|Further list-mount perf improvements]]
- [ ] Reduce monospace font usage — pair a refined sans for body/UI and reserve mono for tokens that earn it.
- [ ] Connections modal revamp — simplify per-user Telegram, Raycast, and API-key management and clarify its relationship to Settings.
- [ ] Improve link-card UI for failed/error fetches (404, 5xx, bot challenge, login walls), with an explicit failure category and retry affordance.
- [ ] Clean up `createStoreInternal`
- [ ] Make link list items more vertically compact and keep processing, idle, and failed states distinct.
- [ ] Pop-animate genuinely new synced/locally-added links without animating filter or category changes.
- [ ] Restore contextual hotkey-tip overlays while modifier keys are held.
- [ ] [[todos/chat-approval-needsapproval|Migrate chat approval to server-side needsApproval (drop deprecated toolsRequiringConfirmation)]]
- [ ] ⌘Z undo for reversible events — wire keyboard undo to events that have a clean inverse (link archive/unarchive, tag add/remove, link tagging, status change, delete). Maintain a small client-side undo stack of the last N user-driven mutations; ⌘Z commits the inverse event. Skip events that are not safely invertible (snapshot/summary writes, sync events).
- [ ] Decouple tag search from id format — filter on normalized tag names and reserve `sanitizeTagName` for new-tag ID derivation.
- [ ] [[todos/link-notes|Notes on links (user-authored, agent-aware)]]

## In Progress

## Human Operations

- [ ] [[todos/human-launch-operations|Verify production Queue retention and recovery]] — durability code is merged; record plan/retention evidence and run the recovery drill.
- [ ] [[todos/human-launch-operations|Reconcile Stripe and Portal behavior]] — maintainer credentials and production payment authority required.
- [ ] [[todos/human-launch-operations|Obtain legal sign-off]] — deletion retention, telemetry/privacy, tracking opt-outs, billing consent, and remaining launch clauses.
- [ ] [[todos/human-launch-operations|Choose certified release evidence or staging]] — select the human-controlled path for behavior local tests cannot prove.
- [ ] [[todos/human-launch-operations|Choose alert destination and owner]] — then wire [[todos/admin-server-ahead-alert|the stuck-sync alert]] and other tripwires.

## Done

- [x] Shrink and budget the Worker upload — PR #94 Oxc-minified the deployable Worker, reducing the Wrangler dry-run upload from 2963 KiB to 1868 KiB gzipped, and added a CI-enforced 2700 KiB pre-limit budget plus a generated-Worker smoke test.
- [x] [[todos/develop-mcp-server|Ship stateless remote MCP for Pro]] — deployed for Pro with OAuth discovery/consent, stateless link-management tools, API parity, request-time authorization, and successful MCP JAM plus production Codex smoke tests.
- [x] [[todos/consolidate-link-operations-in-link-processor|Consolidate link operations in LinkProcessorDO]] — REST and MCP now reuse the existing workspace-owned LiveStore replica through typed `LinkProcessorDO` RPCs; the duplicate WorkspaceLinksDO was removed.
- [x] [[todos/metadata-endpoint-hardening|Align metadata preview with the authenticated bounded-fetch contract]] — the internal preview now requires current workspace/session authorization, uses dedicated per-user abuse protection and bounded fetches, returns non-cacheable responses, and leaves LinkProcessor authoritative.
- [x] [[todos/consolidated-paywall|Consolidated paywall / upgrade acquisition]] — shipped; Settings remains plan management, and residual attribution is tracked separately.
- [x] [[todos/publish-raycast-extension|Publish Raycast extension to Store]] — published through Raycast extensions PR #26889; server source/capability cleanup is tracked separately.
- [x] [[todos/effect-v4-livestore-upstream-migration|Effect v4 migration + LiveStore upstream swap]] — merged in PR #82 (`963373b`) on Effect `4.0.0-beta.99`; concrete post-cutover followups remain separate Todo cards.
- [x] [[todos/server-ingest-durability|Server-side ingest durability code]] — PR #84 merged main-queue backoff, the DLQ re-drive consumer, tripwire logging, and safe dispatcher fallback; PR #85 added the LiveStore persistence barrier. Production retention/recovery-envelope verification remains a human-controlled Todo.
- [x] [[todos/chrome-extension|Chrome extension (Livestore-as-client)]] — shipped and published live on the Chrome Web Store; no repository-controlled publishing work remains.
- [x] [[todos/local-mock-ingest-tui|Local mock-ingest TUI]] — implemented under `scripts/mock-ingest/` and verified with dry-run burst/durability reconciliation.
- [x] [[todos/server-ingest-cold-do-stranding|Server ingest stranded on a cold LinkProcessorDO — link doesn't sync until the next push]] — fixed 2026-08-12 with an app-scoped, event-driven two-stage durability barrier (session queue drains, then leader queue drains). `ingestAndProcess` now waits until the creation event reaches SyncBackend before returning, and subscription processing is held with `ctx.waitUntil` until its follow-on events are durable. All four real-DO regression cases are enabled and green, including backend persistence after forced eviction and independent durability of sequential ingests. Upstream commit receipts (livestorejs#722) can eventually replace the contained internal-state adapter.
- [x] [[todos/e2e-do-sync-testing|E2E testing for DO-to-DO sync]] — PR #46 merged 2026-08-10 (`e278fd1`): 12 miniflare tests over the ingest surface + suite-wide teardown-flake fix (`disableConsoleIntercept: true`). PR #83 (`9e83203`): sync-arrival suite — events asserted to actually reach SyncBackendDO's persisted eventlog (single / concurrent / queue-batch) + eviction survival with cold-boot re-sync. Residual scope (cross-client WS pull, concurrency semantics) recorded in the doc — gated on a livestore test client / hermetic AI stub.
- [x] [[todos/link-processor-stuck-after-eviction|LinkProcessor: self-heal after DO eviction]] — fixed upstream by #1544/#1545, landed here via the v4/upstream swap (PR #82); verified post-cutover, no recurrence. The v3-fork backport contingency is dead.
- [x] [[architecture/livestore-do-rpc-stream-stall|Upstream livestore PR — DO-RPC stream-framing fix]] — obsolete: drain-then-decode merged upstream as #1167 (2026-04) and the DO-RPC/ws-rpc layer was reworked wholesale for Effect v4; no repro on upstream `main` after the swap.
- [x] [[architecture/sync-backend-do-hibernation-billing|DO-hibernation upstreaming + fork retirement]] — upstream `main` carries the full fix chain (#1328 closed, guarded by our test PRs #1427/#1435; DO-RPC recovery via #1541/#1542/#1544/#1545); fork retired via [[todos/effect-v4-livestore-upstream-migration]] (PR #82). `liveLongTimers` probe removal split out as its own Todo.
- [x] [[todos/livestore-0.4.0-upgrade|Upgrade LiveStore snapshot → v0.4.0 stable]] — obsolete (2026-08-09): superseded by the vendored-fork submodule (PR #79); the published `@livestore/*` pins now only serve types/wasm/the A-B hatch and get bumped as part of [[todos/effect-v4-livestore-upstream-migration]].
- [x] [[todos/get-links-api|Links API + in-app API reference]] — API-key-authenticated, Plus+ list/search/get/save/update operations share one domain contract with MCP; consolidating their transport onto `LinkProcessorDO` is tracked above. Legacy `/api/ingest` remains queue-backed. The Settings reference and copy-for-agents spec document the same contracts from `api-spec.ts`.
- [x] Add real Chrome Web Store install link — published listing is now live at `https://chromewebstore.google.com/detail/cloudstash/bdommhffamndfanbpnikgmpjncpcobia`. Promoted `CHROME_WEB_STORE_URL` to `src/lib/extension-connect.ts` (built from `PUBLISHED_EXTENSION_ID` + slug), consumed by `extension-card.tsx` and the `not_installed` state on `/connect/extension`, which now shows a primary "Install from the Chrome Web Store" CTA above the retry button.
- [x] Env-var cleanup in `src/cf-worker/shared.ts` — `EMAIL_FROM` moved into `wrangler.jsonc` `vars` so `cf-typegen` emits it on `Cloudflare.Env`; `PUBLIC_URL` kept as a custom-`Env` optional (both consumers — Telegram webhook URL and Stripe checkout return URL — have request-origin fallbacks, and the value isn't pinned in prod today). End state: `Env` = `LINK_QUEUE` + 3 optionals (`ENABLE_TEST_AUTH`, `GOOGLE_BASE_URL`, `PUBLIC_URL`).
- [x] [[todos/x-content-sub-processing|X (twitter) content enrichment — Pro feature]] — Pro-only enriched AI summaries for x.com bookmarks, hard-capped at 100/org/mo, with image fallback so quoting tweets render a card image
- [x] [[architecture/livestore-do-rpc-stream-stall|Livestore DO-RPC stream stall — root cause, fix, postmortem]]
- [x] AI summary should not block the metadata fetching — obsolete (verified 2026-08-11): the pipeline commits `linkMetadataFetched` right after the fetch and before the AI block (`process-link.ts`), so metadata reaches the UI independent of AI timing.
- [x] Landing page — TanStack Start SSR landing on `/` with hero/pitch/integrations/benefits/pricing/FAQ/closer/footer; SEO hardening (canonical, OG, JSON-LD SoftwareApplication + FAQPage, sitemap.xml, robots.txt, noindex on /login)
- [x] User settings modal (UI) — wired the disabled "Settings" item in the account menu, surfaces full name + email, plan placeholder, danger-zone Delete account with type-DELETE confirmation. Backend deletion split out as its own task (see Account deletion above).
- [x] Replace hand-rolled `InputOTP` with shadcn's `input-otp`-backed component — current `src/components/ui/input-otp.tsx` is a custom implementation skipped during the base-mira refresh. Adopt the registry version (adds `input-otp` dep, exposes `InputOTPGroup`/`InputOTPSlot`/`InputOTPSeparator`) and migrate `pending-approval.tsx` to the compose API.
- [x] [[todos/links-list-performance|Fix links list rendering performance at 150+ links]] — resolved in the keyboard-nav perf session (per-row memo, list-level query Maps, deferred detail pane, TagStrip/Masthead subscription isolation). Virtualization stays in reserve with its trigger (p95 list > 500 or prod trace flags `LinkList`) recorded in the doc.
- [x] Right-pane summary UI redesign — small-caps SUMMARY/TAGS eyebrows replacing icon-above-heading; page description as italic pullquote with em-dash attribution; inline dot-matrix loader (`dotm-square-11`) next to SUMMARY during processing/reprocessing with `AnimatePresence` enter/exit; "Reading the page…" replacing the shimmer placeholder; 300ms blur-in for summary changes (with `prefers-reduced-motion` respect); CheckIcon for Completed status; redundant hairline divider dropped; title weight dialed back from `text-3xl extrabold tracking-tight` to `text-2xl bold`
- [x] Gate all agent UI on per-user feature flag — `isChatEnabled` (from `useOrgFeatures`) gates `AgentChatProvider`/connection mount; AgentTrigger + ⌘J intentionally remain wired to surface the paywall/promo placeholder for non-enabled users.
- [x] Link generation fails locally after redesign — switched from JSON-mode (`Output.object`) to forced tool-calling pattern, upgraded `workers-ai-provider` 3.1.5→3.1.14 (vLLM `toolChoice` mismapping fix), settled on `@cf/meta/llama-3.3-70b-instruct-fp8-fast` for reliable schema adherence (IFEval 92.1, BFCL 77.3)
- [x] Tag combobox redesign — Linear-style multi-select, dual click targets, frozen alphabetic ordering, deferred close-frame cleanup
- [x] Tag manager modal rebuild — opaque dropdown, full-width row click target with pencil affordance, tag validation, modal lifecycle
- [x] ActivityGrid render-cost cut — memoize cell/month/day element arrays so the ~400 React.createElement calls don't fire on unrelated commits (≈25× drop in self-time per render)
- [x] Reprocess button is admin-only now (no longer surfaced to users without AI summary enabled)
- [x] Free-text dock search now matches tag names — added `EXISTS` against `link_tags`/`tags` to each word condition + a score band (80, between title and domain). No `#tag` syntax needed; abstract tags (`to-read`, `wip`) become findable.
- [x] Failed-summary UI — prior dedicated retry affordance was removed; the new bounded automatic recovery/terminal-state outcome is tracked separately.
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
