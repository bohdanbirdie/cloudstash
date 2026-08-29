---
kanban-plugin: board
---

## High Priority

- [ ] `BILL-01` [[todos/plan-usage-limits|Define and enforce usage limits for every plan]] — decide explicit per-plan allowances for saved links, AI summaries, Assistant credits, enrichment, and other bounded work; keep configuration, enforcement, and customer-facing usage states consistent.
- [ ] `REL-07` [[todos/restore-chrome-web-store-listing|Restore the removed Chrome Web Store listing]] — determine why Google removed it, satisfy the publisher requirements, resubmit it, and verify the restored listing describes the actual popup-and-Save flow.
- [ ] `REL-08` [[todos/welcome-existing-users|Approve pending users and send the launch welcome email]] — approve every eligible pending signup, then notify all existing signed-up users that Cloudstash is available to use.
- [ ] `CORE-05` [[todos/initial-sync-blocking|Research HTTP bootstrap and preloaded library state]] — benchmark WebSocket vs HTTP event-log replay, BootStatus/timeout UX, and an upstream materialized snapshot at an exact event head.
- [ ] `CORE-04` [[todos/free-ai-summary-allowance|Plan a bounded Free AI-summary allowance]] — saved-link count remains unlimited; exhaustion preserves the link.
- [ ] `AI-08` [[todos/link-notes|Notes on links (user-authored, agent-aware)]]

## Medium Priority

- [ ] `AI-01` [[todos/pro-larger-summary-model|Give Pro summaries a larger model]] — choose the quality/cost boundary, fallback behavior, and operation-time entitlement; advertise it only after it ships.
- [ ] `AI-04` [[todos/weekly-digest-backend|Weekly Digest backend]]
- [ ] `CORE-01` [[todos/canonical-url-identity|Canonical URL identity across every capture path]] — prevent new duplicates first; historical reconciliation remains a separate decision.
- [ ] `CORE-02` [[todos/telemetry-minimization|Minimize telemetry and document retained provider data]] — keep collection purpose-bound and deletion/retention claims accurate.
- [ ] `UX-07` Improve link-card UI for failed/error fetches (404, 5xx, bot challenge, login walls), with an explicit failure category and retry affordance.
- [ ] `UX-12` Decouple tag search from id format — filter on normalized tag names and reserve `sanitizeTagName` for new-tag ID derivation.
- [ ] `SYS-03` [[todos/ws-close-scope-teardown-exception|SyncBackendDO webSocketClose throws on abnormal close (1006) — upstream teardown fix]] — 2 new `scriptThrewException` on the v4-cutover day (2026-08-10), zero in the prior week; benign (1ms, socket already dead, reconnect fine) but skips `serverCtxMap` cleanup and pollutes the error signal; small upstream PR candidate (make `Scope.close` teardown non-throwing in common-cf `ws-rpc-server.ts:217`).
- [ ] `SYS-04` [[todos/simplify-link-processor-wake|Simplify LinkProcessorDO wake path — retire the manual onPush trigger]] — redundant for warm/cold re-wake since upstream #1541–#1545 (KV-persisted `rpc-sub:` registry + store-less `syncUpdateRpc` recovery); still needed as first-subscribe bootstrap + cutover registry backfill. Pick up after the staging rollback is verified.

## Low Priority

- [ ] `AI-10` [[todos/legacy-chat-livestore-subscriptions|Retire legacy chat LiveStore subscriptions]] — consume the supported upstream unsubscribe path after [LiveStore PR #1551](https://github.com/livestorejs/livestore/pull/1551) lands, then remove the temporary no-op callback after deployed cleanup evidence.
- [ ] `CORE-06` [[todos/automatic-summary-recovery|Recover failed summaries automatically]] — bounded primary, fallback, limited automatic retry, then a calm terminal state.
- [ ] `SYS-01` Retire the local Better Auth MCP JWKS verifier after [#10856](https://github.com/better-auth/better-auth/issues/10856) / [#10888](https://github.com/better-auth/better-auth/issues/10888) and [#10893](https://github.com/better-auth/better-auth/pull/10893) ship in a stable release — installed types must accept an in-process JWKS source plus cache key, and the same-Worker E2E must pass with zero outbound JWKS requests.
- [ ] `SYS-02` Retest Better Auth OAuth resource seeding on future stable upgrades — the Drizzle-wrapped UNIQUE race is independently reproduced on 1.7.0 and still present upstream; keep the app-wide atomic initializer in `AuthClientLive` until concurrent fresh auth contexts pass without it. No upstream issue is being filed.
- [ ] `SYS-05` Remove the temp `liveLongTimers` probe (`src/cf-worker/sync/index.ts:23`) once prod `type:hibernation` GB-s are re-confirmed after the v4-cutover deploy — last remainder of [[architecture/sync-backend-do-hibernation-billing]]. LinkProcessorDO client-side hibernation stays deferred (needs a clean-store re-test, not a new patch).
- [ ] `TEST-01` [[todos/livestore-testing-ui|Livestore UI feature tests (RTL)]]
- [ ] `TEST-02` Revamp component interaction tests around `@testing-library/user-event` — add it as a direct dev dependency, replace the nine localized `fireEvent.click` calls, and preserve realistic focus, pointer, keyboard, and disabled-control behavior.
- [ ] `SYS-07` [[todos/managed-effect-runtime-do|Explore ManagedRuntime for LinkProcessorDO]]
- [ ] `SYS-09` [[todos/openrouter-production-local-ai|Standardize production AI on OpenRouter with a cost-free local path]] — route all production inference through OpenRouter; keep local development explicit and free by default. Cloudflare AI Gateway may proxy OpenRouter later for a demonstrated operational need, but is not the model provider.
- [ ] `UX-03` [[todos/mobile-settings-polish|Mobile settings polish — delete flow, Connections overhaul, tab look]]
- [ ] `UX-09` Pop-animate genuinely new synced/locally-added links without animating filter or category changes.
- [ ] `UX-11` ⌘Z undo for reversible events — wire keyboard undo to events that have a clean inverse (link archive/unarchive, tag add/remove, link tagging, status change, delete). Maintain a small client-side undo stack of the last N user-driven mutations; ⌘Z commits the inverse event. Skip events that are not safely invertible (snapshot/summary writes, sync events).

## In Progress

- [ ] `AI-11` [[todos/chat-token-budget|Make Assistant credits the primary chat usage guardrail]] — move accounting to one atomic library ledger shared by all conversations and include private context-compaction usage.
- [ ] `AI-09` [[todos/multi-chat-architecture|Add multiple chat sessions per library]] — isolate conversation histories without creating another LiveStore replica; preload metadata, load selected content on demand, and compact old model context seamlessly.

## Done

- [x] `AI-03` [[todos/chat-library-owner|Remove the chat LiveStore replica and route tools through LinkProcessorDO]] — the Agents SDK retains messages while every link tool uses Effect RPC over native Durable Object RPC to the canonical `LinkProcessorDO` replica.
- [x] `AI-07` [[todos/chat-approval-needsapproval|Migrate chat approval to server-side needsApproval]] — destructive archive tools use server-declared AI SDK approval and resume through the same authorized RPC boundary.
- [x] `SYS-08` Replace Resend with Cloudflare Email — obsolete; the existing email provider remains sufficient.
- [x] `CORE-03` Extend admin purchase attribution — obsolete; the expected use is too rare to justify additional funnel instrumentation and maintenance.
- [x] `AI-02` Agent context chips and entry points — obsolete; the additional context-management UI is not justified by expected usage.
- [x] `REL-01` Verify production Queue retention and recovery — obsolete; production ingestion is healthy and no additional recovery drill is required for release.
- [x] `REL-02` Reconcile Stripe and Portal behavior — removed from the engineering board; the maintainer will verify production billing manually.
- [x] `REL-03` Obtain legal sign-off — removed from the engineering board as a separate maintainer responsibility.
- [x] `REL-04` Verify or update the published Chrome Web Store listing — superseded by `REL-07` after Google removed the listing.
- [x] `REL-05` Provision and certify staging — staging deployment and its critical flows were tested successfully.
- [x] `REL-06` Choose alert destination and owner — obsolete as a release-tracked engineering task.
- [x] `SYS-06` Review stateful SQLite ProgressTracker — obsolete; no measured issue justifies adding a table, migration, and lifecycle writes.
- [x] `SYS-10` Clean up `createStoreInternal` — obsolete; no concrete defect or simplification target remains.
- [x] `UX-01` Fix suggested-tag acceptance stutter — reconciled as obsolete; no current release work remains for this behavior.
- [x] `AI-05` Rotate AI-summary loading messages — shipped with distinct initial and reprocessing phrase sets in the link detail summary.
- [x] `AI-06` Prefer existing tags and use domain context for AI suggestions — shipped in the summary prompt, matching logic, and regression coverage.
- [x] `INT-01` Develop CLI for ingestion and management — obsolete; supported ingestion is covered by the web, extension, Telegram, Raycast, API, MCP, and the local mock-ingest diagnostic tool.
- [x] `INT-02` Historical X bookmark import for Pro — obsolete; the shipped integration intentionally pins the newest bookmark on connect and syncs new bookmarks from that point onward.
- [x] `INT-03` Review and develop X integrations — shipped with account connection, automatic new-bookmark sync, pause/resume/reconnect handling, and Pro enrichment.
- [x] `INT-04` Simplify Telegram bot auth with a login link — shipped through the browser-based one-time-code connection flow; the manual API-key path remains only as a legacy compatibility path.
- [x] `INT-05` Connections modal revamp — shipped as the unified Integrations section in Settings with Telegram, X, MCP, Chrome, and Raycast states.
- [x] `UX-02` Mobile view review and fixes — reconciled as complete after the responsive application and detail surfaces shipped.
- [x] `UX-04` Improve the tags strip — shipped with status-aware counts, responsive overflow, suggestion handling, and keyboard navigation.
- [x] `UX-05` Further list-mount performance improvements — reconciled as complete; the current memoized/query-indexed list is within the accepted performance envelope.
- [x] `UX-06` Reduce monospace font usage — shipped; mono is now reserved for code, identifiers, numeric data, shortcuts, and deliberate display accents.
- [x] `UX-08` Make link-list items more compact — shipped with the current dense row geometry and distinct state presentation.
- [x] `UX-10` Restore contextual modifier-key hotkey tips — shipped as the held-modifier selection preview and contextual shortcut affordances.

- [x] [[todos/customer-facing-copy-accuracy|Align customer-facing copy with shipped behavior]] — repository-controlled plan, landing, README, SEO, integration, Terms, and privacy copy now matches shipped behavior in plain language; external legal, Stripe, and Chrome Web Store verification remain explicit human operations.
- [x] [[todos/paid-capability-enforcement|Enforce paid capabilities and budgets at operation time]] — authoritative operation gates and atomic budgets now cover paid features; the separate Agents SDK connection-identity limitation remains tracked in DELTA-042.

- [x] [[todos/raycast-capability-source-cleanup|Align Raycast source and entitlement semantics]] — trusted key metadata now preserves `source: raycast`, pairing and each capture use `integrations`, and direct API keys remain `publicApi`-gated.
- [x] Free workspaces cannot manually generate weekly digests — manual generation, alarm execution, and entitlement-change scheduling now enforce `weeklyDigest` and remove stale alarms.

- [x] Adopt an enforced cyclomatic-complexity budget with Oxc [`eslint/complexity`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/complexity) — the Vite+ quality lane now enforces Oxc's default classic maximum of 20 across shipped and build code while excluding test scenarios; five existing hotspots were split only at concrete responsibility boundaries, with no intended behavior changes or local suppressions.
- [x] Repair the new-signup approval gate — the admin switch controls signup approval, app entry bypasses stale Better Auth approval cookies, approved users are not trapped, and pending users retain tested sign-out and account-deletion escape routes.
- [x] [[todos/done/account-deletion|Reliable account deletion workflow]] — deletion now runs as a durable Cloudflare Workflow with Effect activities, bounded D1 cascades, Stripe cancellation, Durable Object shutdown, integration cleanup, and retry/resume coverage.
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
- [x] Env-var cleanup in `src/cf-worker/shared.ts` — `EMAIL_FROM` moved into `wrangler.jsonc` `vars` so `cf-typegen` emits it on `Cloudflare.Env`; `PUBLIC_URL` kept as a custom-`Env` optional (both consumers — Telegram webhook URL and Stripe checkout return URL — have request-origin fallbacks, and the value isn't pinned in prod today). End state: `Env` = `LINK_QUEUE` + 2 optionals (`ENABLE_TEST_AUTH`, `PUBLIC_URL`); the unused Google OAuth emulator override was retired.
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
