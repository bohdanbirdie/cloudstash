# X (Twitter) content sub-processing — Pro feature

Smarter AI summaries for bookmarked tweets. When the saved tweet is a thread starter, fetch the author's continuation to capture the full thread; when it's a reply, use that tweet alone. In both cases, fetch metadata for any external URLs in the tweet body. Compose with a stronger model than the free-tier summarizer.

Pro-only. Hard monthly per-user cap. Today's basic summary still ships first; enrichment supersedes it asynchronously.

## Decision tree (the whole feature, in one diagram)

```
Pro user bookmarks x.com URL
  ↓
syndication call (already happens in MetadataFetcher today)
  ↓
┌──────────────────────────────┬──────────────────────────────┐
│ HAS in_reply_to_status_id_str │ NO in_reply_to_status_id_str │
│ → it's a reply                │ → it's a thread starter      │
│ → use this tweet only         │ → fetch author's recent      │
│                               │   timeline + filter by       │
│                               │   conversationId, cap N=20   │
└──────────────────────────────┴──────────────────────────────┘
            ↓
quoted_tweet body (free — already in syndication payload, if present)
            ↓
for each external URL in tweet body(ies):
  fetch OG metadata via existing MetadataFetcher
  (NOT full LinkProcessor — title + description only, cap 3 URLs)
            ↓
compose enriched prompt → google/gemini-2.5-flash
            ↓
emit linkSummarized event with fresh id and enrichment model tag
  → UI already queries latest by (linkId, summarizedAt DESC), so
    enriched summary naturally supersedes the basic one
```

## Why no upward walk

Earlier draft included walking parents upward when the user bookmarked a reply tweet. Cut after product feedback: **if a user bookmarked tweet N (not N=1), they specifically chose that message.** Walking up imposes context they didn't ask for. Honors the user's selection.

If telemetry later shows users routinely bookmark mid-thread tweets expecting context, revisit. Upward walk via syndication parent chain is free, so it's a 1-PR add later if needed.

## Why twitterapi.io as primary thread source

Three options were evaluated for the downward walk:

| Path                                          |    Cost/thread | Time window | Reliability                                     | Risk                                                          |
| --------------------------------------------- | -------------: | ----------- | ----------------------------------------------- | ------------------------------------------------------------- |
| Official X API v2 (`/2/tweets/search/recent`) |        ~$0.025 | 7 days      | High                                            | None                                                          |
| twitterapi.io                                 | ~$0.003–$0.005 | Unlimited   | Vendor self-reports 99.99%; no independent data | Vendor contractually pushes ToS compliance back onto consumer |
| Cloudflare Browser Rendering                  |            N/A | N/A         | Dead                                            | CF self-identifies as bot; x.com returns 402                  |

twitterapi.io picked because:

- **7-day window on official API is fatal** for the dominant use case (users bookmark threads days/weeks/months after they were posted).
- ~5× cheaper than official API per call and **the only realistic option without a time-window limit**.
- Acceptable risk profile if wrapped behind a swappable interface + admin kill switch + graceful degradation. **Note:** twitterapi.io's terms explicitly disclaim X affiliation and shift X-ToS compliance burden onto us in writing. Our exposure exists; mitigation is the existing posture (small volume, admin kill switch, swap-able vendor layer).

X's recent litigation (Bright Data 2025, CCDH) targets scrapers, not downstream consumers. The $15K liquidated-damages clause in X's ToS triggers at 1M+ posts/24h via automation — far above our envelope. No documented C&D precedent against consumers of third-party Twitter scrapers. Low-but-nonzero risk; the kill switch is the response if posture changes.

The Browser Rendering path was eliminated by research, not deprioritized — confirmed live that fetches to `x.com/jack/status/20` return HTTP 402. CF sends signed bot headers that can't be disabled.

## API mechanics (the load-bearing detail)

twitterapi.io does NOT expose "give me the author thread for tweet X" as a single call. The naive `thread_context` endpoint returns ancestors + target + breadth-1 replies from everyone, which inflates cost and pollutes the prompt with non-author replies.

Use `GET /twitter/get_user_last_tweets` instead:

1. From the syndication payload (already fetched in MetadataFetcher) read `author.screen_name`, `tweet.id`, `tweet.createdAt`.
2. Call `get_user_last_tweets?userName=<handle>` once. Up to 20 tweets per page, 15 credits per tweet returned (so ~$0.003 per call at the 100k-credits-per-$1 rate).
3. Client-side filter: keep tweets where `conversationId == bookmarkedTweetId`. Those are author continuations of this exact thread — no third-party replies, no other threads.
4. Cap at N=20 (matches the spec's existing cap).
5. **Stale-bookmark fallback:** if the author has tweeted past the 20-tweet window since the bookmark date, paginate via cursor with a `createdAt < bookmark.createdAt` abort. Most enrichments will be one call; old + chatty-author bookmarks may need 2-3.

Field naming gotcha: vendor uses `inReplyToId` (camelCase); syndication uses `in_reply_to_status_id_str` (snake_case). The `ThreadProvider` Layer is the right place to normalize.

**Pagination flakiness:** vendor docs warn `has_next_page` may return `true` while subsequent requests are empty. Loop must break on N consecutive empty pages, not on `has_next_page=false` alone.

## Architecture

> **2026-05-25 pivot — actual shipped design is a single-pass router, NOT a queue.**
> The original plan (diagram below, preserved for the "why") was queue-driven:
> emit the basic summary, then asynchronously enrich and emit a second
> `linkSummarized` that supersedes the first via the latest-by-timestamp query.
> That doesn't reach Telegram — Telegram delivery is event-driven on
> `notified === false` and fires once when the basic summary commits. The
> enriched summary would never get pushed. Collapsed to **pick enricher vs.
> basic summarizer up-front inside `processLink`, with soft fallback to basic
> on any enrichment error** (per-tag `Effect.catchTags` over budget /
> ThreadProvider* / EnrichmentGenerate / EnrichmentUsage* errors). Single
> `linkSummarized` commit; Telegram delivery, queue concurrency, and all
> downstream notifiers keep working unchanged. Code lives in
> `src/cf-worker/link-processor/process-link.ts:127-242` (router) and
> `src/cf-worker/x-enrichment/{enricher,generator,usage}.ts`.

Today's pipeline emits one `linkSummarized` either way; the model field tells the UI whether it's basic or enriched.

```
LinkProcessor (single pass)
  ├─ pickSummarizer:
  │    canEnrich = xContentEnrichmentEnabled && hasStoreId && isXTweetUrl(url)
  │    if canEnrich:
  │      → enrichSummary({storeId, url, existingTags})
  │          ├─ EnrichmentUsage.current (KV) — bail w/ BudgetExhausted if ≥ cap
  │          ├─ ThreadProvider.fetchContext(url)  ← Effect.Service
  │          │    today: syndication-only noop impl
  │          │    PR #3: twitterapi.io impl (get_user_last_tweets + filter)
  │          ├─ EnrichmentGenerator.generate({url, context, existingTags})
  │          │    OpenRouter generateObject → google/gemini-2.5-flash
  │          │    returns {summary, suggestedTags}
  │          └─ EnrichmentUsage.increment (KV)  ← only on success
  │      catchTags → all enrichment errors fall back to basic summarizer
  │    else:
  │      → AiSummaryGenerator.generate (existing basic path)
  │
  └─ emit linkSummarized with model = ENRICHMENT_MODEL or AI_MODEL (single commit)
        → Telegram subscription fires on notified === false (unchanged)
        → UI renders summary; model field drives "Enriched" chip (PR #3+)
```

Key properties:

- **Failure cannot regress the user-visible state.** If enrichment errors out, the router transparently falls back to the basic summarizer and the same `linkSummarized` commit fires with `model = AI_MODEL`. Worst case is "Pro user got a free-tier summary this time" — no broken UI, no missing card, no missed Telegram push.
- **`ThreadProvider` is an Effect.Service** (codebase preference over raw `Context.Tag`), with twitterapi.io + syndication-only impls. Pattern mirrors `XApiClient` in `src/cf-worker/x-sync/services.ts`. Swapping vendors or shadow-testing a second impl becomes a one-line layer change.
- **No new event type needed.** The existing `linkSummarized` event already carries a `model` field. Router picks one summarizer up-front and commits exactly once — the `model` value distinguishes basic vs. enriched. **No schema migration, no supersession, no second event.**
- **Inline URL expansion is metadata-only.** Reusing `MetadataFetcher.fetch` (Context.Tag service with 10s timeout + 2 retries already baked in per `src/cf-worker/link-processor/services/metadata-fetcher.live.ts`). Full `LinkProcessor` invocation per inline link was considered and dropped — overkill for "the tweet links to article X" context; OG title + description is enough signal for the LLM.
- **Quoted tweet body is free.** Syndication payload already returns `quoted_tweet` inline; we just don't read it today. Including it in the enriched prompt is one field read.

## Cost model

| Component                                               |               Cost | Notes                                                                |
| ------------------------------------------------------- | -----------------: | -------------------------------------------------------------------- |
| Syndication call                                        |                 $0 | already happens today                                                |
| `get_user_last_tweets` (1 page, 20 tweets)              |            ~$0.003 | only for thread starters; stale-bookmark fallback may need 2-3 pages |
| Inline URL metadata (3 URLs, OG only)                   |                ~$0 | already a free call                                                  |
| Gemini 2.5 Flash composition                            |            ~$0.001 | $0.30/M in, $2.50/M out; richer prompt ~1k in, ~200 out              |
| **Per-enrichment typical (reply tweet, no walk)**       |        **~$0.001** | just the LLM call                                                    |
| **Per-enrichment typical (root, single page)**          |        **~$0.004** |                                                                      |
| **Per-enrichment worst case (root, 3-page stale walk)** |        **~$0.010** |                                                                      |
| **100-enrichment monthly cap × per-user worst**         | **~$1.00/user/mo** | most users will land much lower                                      |

Hard cap of **100 enrichments/user/month** for v1. Comfortable margin against Pro pricing even at the worst-case envelope. Cache hits (next section) bring real cost meaningfully lower; the cap exists mainly to bound unknown unknowns.

## Hardening (non-negotiable from day 1)

All stem from "we don't control the upstream data source":

- **`ThreadProvider` Effect.Service abstraction** with twitterapi.io + syndication-only impls. Layer swap is one line. Mirrors `XApiClient` precedent.
- **Cache by tweet_id** with 24h+ TTL. Viral threads are exactly what multiple users bookmark — caching kills the long-tail cost. No precedent in codebase (only `TELEGRAM_KV` exists today); add a new `ENRICHMENT_CACHE` KV namespace to `wrangler.jsonc` for consistency with the existing pattern.
- **Graceful degradation** — if `fetchContext` errors or times out (budget ~4s), enrich with whatever syndication + URL metadata gave us. Never block the basic summary path.
- **Admin kill switch** via `organization.featureOverrides.xContentEnrichment` (the `featureOverrides` JSON column, typed `CapabilityOverrides` — see `src/cf-worker/db/schema.ts:41-43`). Add `"xContentEnrichment"` to `TierCapabilities` in `src/lib/plan.ts` and to `BOOLEAN_CAPABILITY_KEYS` in the admin workspaces handler. Reuses `requireCapability(orgId, "xContentEnrichment")` from `src/cf-worker/billing/service.ts:229-249`.
- **Per-user monthly cap enforcement** — hard cap at 100/month. `getCurrentPeriod()` returns `"YYYY-MM"` (UTC calendar month, existing pattern in `src/cf-worker/chat-agent/usage.ts`); reuse it. Counter pattern can either inline (simpler) or extract `reserveTokensIn` / `reconcileTokenUsageIn` from `chat-agent/usage-core.ts` into a reusable Layer (cleaner, larger change). v1 inlines.
- **Queue concurrency ≤3** in `wrangler.jsonc` consumer config. twitterapi.io's $10-balance tier caps at 3 QPS; we should never bursty-call past that even under enrichment load.
- **Pagination loop** must break on N=2 consecutive empty pages, not solely on `has_next_page=false` (vendor pagination is documented as unreliable).
- **Tagged errors** — `ThreadProviderError`, `ThreadProviderTimeoutError`, `EnrichmentBudgetExhaustedError`. All `Schema.TaggedError` so `catchTag` keeps OTel logs structured.

**Deferred to v2 (intentionally NOT in scope):**

- Soft warning at 80% of monthly cap. Chat-agent today only has a hard cap; no precedent for soft warnings + toast infrastructure. Ship with the hard cap; add soft warning if data shows users hit the cap and care.
- Automatic downgrade self-heal (Pro → Free should disable enrichment for in-flight users). **Known gap shared with x-bookmark-sync**, which has the same posture in its doc but no implementation either. Worth a coordinated follow-up task for both features. v1 relies on the per-call `requireCapability` check, which catches downgrades on the next bookmark naturally.

## UI

All components exist and are drop-in:

- **`✨ Enriched`** small-caps eyebrow chip via the existing `SectionEyebrow` component in the right-pane detail view, sibling to the existing SUMMARY/TAGS chips. Distinguished by checking `linkSummary.model` — if it matches the enrichment model name, render the chip.
- **Tooltip on the chip** explains what enrichment did: "Summary includes the full thread / quoted tweet / linked articles." Three short variants depending on what actually contributed.
- **Loading state** — basic summary shows the existing `dotm-square-11` loader until enrichment completes (≤30s typical), then 300ms blur-in for the swap. The animation already exists in `src/components/right-pane/detail-view/ai-summary.tsx:122-129` and is keyed on summary id, so it triggers naturally on the swap. Respects `useReducedMotion()` already. Localized to the markdown text only — does not animate the whole right-pane (honors the `feedback_no_whole_field_animation` memory).
- **Cap-exhausted state** — if user hits the monthly cap, no chip appears on new X bookmarks; settings shows current usage + reset date. Pattern mirrors the existing chat usage indicator in `src/components/chat/chat-content/usage-indicator.tsx`.

## Schema implications

**No livestore migration required.** Reuses the existing `linkSummarized` event (`src/livestore/schema.ts:278-287`) and `linkSummaries` table — emit with a fresh id and the enrichment model name in the `model` field. The materializer's `onConflict("id", "ignore")` is the desired behavior; the latest summary wins via the existing `summarizedAt DESC` UI query.

**No D1 migration required** for the capability flag — `featureOverrides` is a JSON column; adding a key is a TypeScript-only change to `TierCapabilities`. Same pattern x-bookmark-sync used.

The only schema-shaped change is the new queue + KV namespace bindings in `wrangler.jsonc`, neither of which is a migration.

## Shipping order

Four PRs, each independently mergeable. Ship in this order so each PR is testable end-to-end.

1. **Quoted tweet body in prompt** ✅ shipped 2026-05-24 (commit `4826347` on `feat/x-content-enrichment`). Folded `quoted_tweet.text` into the description field of the x.com extractor. Validated end-to-end against a live quoting tweet — AI summary now grounds on quoted content.
2. **Single-pass enrichment router + `ThreadProvider` Effect.Service + syndication-only impl + `xContentEnrichment` capability + monthly cap + image-fallback chain** ✅ shipped 2026-05-25 on `feat/x-content-enrichment`. Diverged from the original plan in two ways:
   - **Router instead of queue.** Discovered mid-implementation that the queue-driven two-pass would never deliver enriched summaries to Telegram (Telegram subscription is event-driven on `notified === false`, fires once). Collapsed to a single-pass router inside `processLink` with `Effect.catchTags` soft-fallback to basic over all 10 enrichment failure modes (budget exhausted, 6× `ThreadProvider*`, `EnrichmentGenerate`, `EnrichmentUsageGet/Put`). One `linkSummarized` commit either way; downstream notifiers untouched.
   - **No UI chip yet.** The `model` field on `linkSummarized` already carries the enrichment model name (`google/gemini-2.5-flash`); the `✨ Enriched` chip + tooltip is trivial to wire in PR #3 alongside the real twitterapi.io provider.
   - **Bonus: image-fallback chain in the X extractor** (parent `mediaDetails` → quoted-tweet `mediaDetails` → first non-twitter linked-URL `og:image` → tweet-page `og:image`). Decision logic extracted as pure `pickImage(data, tweetUrl, lookupOgImage)` with `vi.fn` mocks in tests — no env hacks, no parallel parser.
   - Includes `EnrichmentGenerator` (Vercel AI SDK `generateObject` returning `{summary, suggestedTags}`), `EnrichmentUsage` KV-backed monthly counter (split `Get`/`Put` tagged errors, 70-day TTL), `ThreadProviderNoopLive` (syndication-only impl, real fetch with timeout + 6 tagged error variants), `xContentEnrichment` capability in `TierCapabilities` + admin toggle, `ENRICHMENT_USAGE` KV binding in `wrangler.jsonc`. Router covered by 8 unit tests (happy + budget + provider HTTP/empty + generator failure + 3 gating branches).
3. **twitterapi.io impl + thread starter walk + `ENRICHMENT_CACHE` KV cache + `✨ Enriched` UI chip** — the actual feature. Behind a separate inner feature flag inside the Pro capability so we can roll forward/back without touching entitlement.
4. **Inline URL metadata expansion** — `MetadataFetcher.fetch` invoked for up to 3 URLs in parallel; results folded into prompt composition. Small, low-risk.

## Files this will touch

**PR #1 ✅:**

- `src/cf-worker/metadata/extractors/twitter.ts` — `quoted_tweet.text` folded into description

**PR #2 ✅ (router pivot — no queue):**

- `src/cf-worker/link-processor/process-link.ts` — single-pass enrichment router with `Effect.catchTags` soft-fallback
- `src/cf-worker/link-processor/durable-object.ts` — pass `xContentEnrichmentEnabled` + `storeId` into `processLink`; wire enrichment layers into the live layer chain
- `src/cf-worker/x-enrichment/` (NEW) — `enricher.ts` (orchestrator), `generator.ts` (Vercel AI `generateObject`), `usage.ts` (KV counter, split `Get`/`Put` errors), `errors.ts` (6 `ThreadProvider*` + `EnrichmentBudget/Generate`), `types.ts` (`ENRICHMENT_MODEL`, `MONTHLY_ENRICHMENT_CAP`, `isXTweetUrl`, period key), `services.ts` (`ThreadProvider` Effect.Service), `services/thread-provider-noop.live.ts`
- `src/cf-worker/metadata/extractors/twitter.ts` — image-fallback chain via injected `lookupOgImage` (bonus)
- `wrangler.jsonc` — added `ENRICHMENT_USAGE` KV namespace
- `src/lib/plan.ts` — `xContentEnrichment: boolean` on `TierCapabilities` (free=false, plus=false, pro=true)
- `src/cf-worker/admin/workspaces.ts` + `src/components/admin/workspaces-tab/redact.ts` + `src/components/admin/use-workspaces-admin.ts` — `"xContentEnrichment"` in `BOOLEAN_CAPABILITY_KEYS`

**PR #3 (twitterapi.io + cache + UI chip):**

- New: `src/cf-worker/x-enrichment/services/thread-provider-twitterapi.live.ts`
- `wrangler.jsonc` — new `ENRICHMENT_CACHE` KV namespace
- `src/components/right-pane/detail-view/ai-summary.tsx` — `✨ Enriched` chip + tooltip, gated on `linkSummary.model === ENRICHMENT_MODEL`
- `src/components/settings/` — current usage + reset date

**PR #4 (inline URL expansion):**

- `src/cf-worker/x-enrichment/enricher.ts` — fold up to 3 `MetadataFetcher.fetch` results into prompt context

**No changes to:** `src/livestore/schema.ts` (event + table reused); no D1 migration.

## Launch checklist

**Done in PR #2:**

- [x] `TierCapabilities.xContentEnrichment` added, defaults set, admin handler updated
- [x] `wrangler.jsonc`: `ENRICHMENT_USAGE` KV namespace
- [x] OTel spans wired (PR #2 scope): `X.enrichSummary`, `EnrichmentGenerator.generate`, `EnrichmentUsage.current/increment`, `ThreadProviderNoop.fetchContext`, `LinkProcessor.aiSummarize` (with `canEnrich` attribute). Attributes: `storeId` (masked via `maskId()`), `tweetId`, `model`, `responseStatus`, `period`, `used`, `cap`
- [x] Soft-fallback path tested in unit (`process-link.test.ts` router suite — budget exhausted / provider HTTP 503 / provider empty / generator failure all fall through to basic with `AI_MODEL`)

**Remaining (PR #3+):**

- [ ] twitterapi.io account provisioned, API key stored as Worker secret (`TWITTERAPI_IO_KEY` suggested)
- [ ] `wrangler.jsonc`: `ENRICHMENT_CACHE` KV namespace (cache-by-tweet-id)
- [ ] OpenRouter spend dashboard alert at 2× projected monthly cost
- [ ] Admin kill switch tested via admin workspaces UI toggle (existing pattern in `src/components/admin/workspaces-tab/workspace-card.tsx`)
- [ ] Per-user cap enforcement tested end-to-end (hit 100, confirm 101st falls back to basic without enriched chip)
- [ ] Pro gate tested both directions (free user → router skips enrichment branch; downgraded user → next bookmark sees `xContentEnrichmentEnabled=false` and takes basic path)
- [ ] OTel attributes extended for PR #3 vendor: `threadLength`, `cacheHit`, `vendorLatencyMs`, `inputTokens`, `outputTokens`
- [ ] Pagination break-on-empty tested (vendor returns `has_next_page=true` then empty page → loop exits cleanly)

## Empirical questions to measure post-launch

These weren't answerable from research and should drive v2 priorities:

- **Cache hit rate on tweet_id.** Drives the actual unit-cost curve. If high (viral threads dominate), we can raise the monthly cap or skip it.
- **% of enriched bookmarks that are thread-starter vs reply.** Validates the no-upward-walk decision. If reply bookmarks turn out to mostly want context, the decision should be revisited.
- **twitterapi.io reliability in practice.** Vendor self-reports 99.99% but no third-party data exists. Track our own error rate; >2% sustained = invest in the second-vendor / official-API-fallback Layer impl.
- **Distribution of thread length.** If long threads (>20 author-replies) are common, the N=20 cap starts losing material content. Also: are we routinely hitting the stale-bookmark multi-page case? Drives cost projections.
- **Pro-user retention delta** between enrichment-eligible bookmarks and non-X bookmarks. The actual product question this feature exists to answer.

## Deferred / v2

- **Image OCR** on tweet media. Research priced this at ~$0.00057/image (Gemini 3.1 Flash Lite); ~9¢/user/month at 150 images. Cheap but additive — ship after we see whether text-only enrichment closes most of the quality gap. **Caveat:** twitterapi.io's documented `TweetEntities` schema does NOT include media URLs (only hashtags, urls, user_mentions). Media may be present at runtime but isn't contractually exposed. Verify empirically before committing to this v2 path; may need a separate vendor endpoint or syndication fallback for media.
- **Soft warning at 80% of monthly cap** + toast UI. Chat-agent has no precedent; ship if hard-cap-only proves too sharp an edge.
- **Automatic downgrade self-heal** — shared follow-up with x-bookmark-sync. Today, downgraded Pro users keep their counter and stop getting enrichment on their next bookmark via `requireCapability`. A dedicated cleanup workflow (cancel in-flight queue messages, wipe counter, log audit event) is the cleaner long-term posture.
- **Official X API as a second `ThreadProvider` impl**, shadow-tested on a small % of traffic. Insurance against twitterapi.io disappearing or getting blocked by X. Costs nothing to keep warm if it shares the Layer interface.
- **Upward walk** for mid-thread bookmarks, if telemetry shows users expect context there.
- **Cross-reference to user's saved library** — when an inline URL in the tweet body is already saved by this user, render a "References [your saved Link Title]" affordance. Builds on the inline-URL expansion step from PR #4.
- **Bookmark-thread continuity** — if user bookmarks T2 and later T5 of the same thread, merge into one Cloudstash link with a "spans 4 tweets" indicator. Requires a supersession model in the schema; nontrivial.
- **Reusable usage-counter Effect Layer** — extract `reserveTokensIn` / `reconcileTokenUsageIn` from `chat-agent/usage-core.ts` into a generic primitive so both chat and enrichment (and future Pro features) share one implementation. Pure refactor.

## Triggers to revisit before implementing

- If twitterapi.io's pricing or availability changes materially before we ship, re-evaluate official API + 7-day window as an acceptable v1.
- If x-bookmark-sync ships its downgrade self-heal first, fold this feature's downgrade story into the same mechanism rather than building a parallel one.
- If X ships a structured-conversation endpoint in the official API at sane pricing (unlikely but tracked on devcommunity), collapse this whole architecture.

## References

- Brainstorm thread that produced this scope (chat session 2026-05-24)
- Three validation-agent reports against this spec (chat session 2026-05-24): twitterapi.io feasibility, codebase patterns, livestore/usage/entitlements
- [[architecture/metadata-extraction]] — convergence point this feature extends
- [[architecture/link-processor]] — pipeline this feature runs alongside
- [[features/x-bookmark-sync]] — existing Pro X integration; entitlement pattern reused
- `src/cf-worker/billing/service.ts:229-249` — `requireCapability` (reused for gating)
- `src/cf-worker/x-sync/services.ts` — `XApiClient` Effect.Service (pattern to mirror)
- `src/cf-worker/weekly-digest/generator.ts` — OpenRouter integration (pattern to mirror)
- `src/cf-worker/link-processor/services.ts:30-37` — `MetadataFetcher` (reused for inline URL expansion)
- `src/lib/plan.ts` — `TierCapabilities` (extended with `xContentEnrichment`)
