# X (Twitter) content enrichment — Pro feature

Richer AI summaries for bookmarked tweets. Pro-only, hard monthly cap, gracefully degrades to the basic summarizer on any failure.

**Status:** shipped 2026-05-25 on `feat/x-content-enrichment`. The original 4-PR plan was scoped down to 2 after the first iteration; PR #2's quality (syndication-only context + image-fallback chain) closed enough of the gap that PRs #3 and #4 (twitterapi.io thread walk, KV cache, inline URL expansion, Enriched UI chip) were judged not worth the effort. See [Scope cut](#scope-cut) for the why.

## What shipped

1. **PR #1 — Quoted-tweet body in extractor** (commit `4826347`, 2026-05-24). `quoted_tweet.text` folded into the X extractor description so the existing AI summary grounds on quoted content.
2. **PR #2 — Single-pass enrichment router + image-fallback chain** (commit `1d828a6`, 2026-05-25). All scaffolding + the actual enriched summarizer + tweet-card image coverage; see breakdown below.

### PR #2 breakdown

- **Router inside `processLink`** picks enricher vs. basic summarizer up-front, based on `xContentEnrichmentEnabled && storeId && isXTweetUrl(url)`. Any enrichment failure falls back to the basic summarizer through per-tag `Effect.catchTags` over all 10 enrichment failure modes (1× `EnrichmentBudgetExhausted`, 6× `ThreadProvider*`, 1× `EnrichmentGenerate`, 2× `EnrichmentUsage{Get,Put}`). **One `linkSummarized` commit either way** — the existing Telegram subscription (event-driven on `notified === false`) keeps working unchanged.
- **`ThreadProvider` Effect.Service** with a syndication-only live impl (`ThreadProviderNoopLive`). Pulls the bookmarked tweet via `cdn.syndication.twimg.com/tweet-result` with a 10s timeout, branded `XTweetId`/`XUsername`, six tagged error variants (invalid URL / transport / HTTP / response parse / empty / timeout). The "Noop" name reflects that there's no thread walk — it just structures what syndication already gives us (root + quoted body + author + external URLs).
- **`EnrichmentGenerator`** uses Vercel AI SDK `generateObject` against OpenRouter (`google/gemini-2.5-flash`) returning `{summary, suggestedTags}`. Prompt rules ground every fact in the input — strong anti-fabrication after eyeball-script hallucinations during prompt validation.
- **`EnrichmentUsage`** is a KV-backed monthly counter keyed by `enrichment:{orgId}:{YYYY-MM}` with a 70-day TTL. Split `Get`/`Put` tagged errors. Hard cap **100 enrichments/org/month**. Increment only fires on a successful generation.
- **Capability `xContentEnrichment`** in `TierCapabilities` (`free=false, plus=false, pro=true`), wired through admin override (`BOOLEAN_CAPABILITY_KEYS`).
- **Image-fallback chain in the X extractor** (the bonus that made PRs #3/#4 unnecessary): parent `mediaDetails` → quoted-tweet `mediaDetails` → first non-twitter linked-URL `og:image` → tweet-page `og:image`. Decision logic is a pure `pickImage(data, tweetUrl, lookupOgImage)` with the og:image lookup injected as a function, so unit tests use `vi.fn` mocks without touching HTMLRewriter or global fetch.

## Architecture

```
LinkProcessor (single pass)
  ├─ pickSummarizer:
  │    canEnrich = xContentEnrichmentEnabled && hasStoreId && isXTweetUrl(url)
  │    if canEnrich:
  │      → enrichSummary({storeId, url, existingTags})
  │          ├─ EnrichmentUsage.current (KV) — bail w/ BudgetExhausted if ≥ cap
  │          ├─ ThreadProvider.fetchContext(url)   ← syndication-only impl
  │          ├─ EnrichmentGenerator.generate({url, context, existingTags})
  │          │    OpenRouter generateObject → google/gemini-2.5-flash
  │          │    returns {summary, suggestedTags}
  │          └─ EnrichmentUsage.increment (KV)    ← only on success
  │      catchTags → all enrichment errors fall back to basic summarizer
  │    else:
  │      → AiSummaryGenerator.generate  (existing basic path)
  │
  └─ emit linkSummarized with model = ENRICHMENT_MODEL or AI_MODEL (single commit)
        → Telegram subscription fires on notified === false (unchanged)
```

Key properties:

- **Failure cannot regress the user-visible state.** Enrichment errors transparently fall back to the basic summarizer; same `linkSummarized` commit, same Telegram push.
- **No new event, no schema migration.** Reuses `linkSummarized`; the `model` field distinguishes basic vs. enriched.
- **No queue, no DLQ, no second pipeline.** Router lives inline in `processLink`; the only new infra is the `ENRICHMENT_USAGE` KV namespace.

## Scope cut

The original spec proposed two more PRs — both deliberately dropped:

- **PR #3 (twitterapi.io thread walk + `ENRICHMENT_CACHE` KV + Enriched UI chip).** Would have called `get_user_last_tweets`, filtered by `conversationId`, cached results by tweet id, and added a UI chip indicating enriched status. **Cut because** the syndication-only enrichment + image-fallback chain already produces good summaries on the vast majority of bookmarked tweets, and the marginal lift (full author continuations for thread starters) doesn't justify a vendor dependency, ToS compliance posture, monthly cost, cache layer, and admin tooling.
- **PR #4 (inline URL metadata expansion).** Would have run `MetadataFetcher.fetch` on up to 3 external URLs from the tweet and folded OG metadata into the prompt. **Cut because** the model already does a credible job with just the tweet text + quoted body, and the extra fetches add latency for marginal accuracy.

If telemetry later shows summaries on thread starters are noticeably worse than on standalone posts — or if users complain about thread-starter quality specifically — revisit. The `ThreadProvider` interface is already abstracted exactly so a real impl drops in as a one-line Layer swap without touching the router or any callers.

## Cost

- Syndication call: $0 (cdn.syndication.twimg.com is free)
- Gemini 2.5 Flash composition: ~$0.001/enrichment ($0.30/M in, $2.50/M out; ~1k in / ~200 out)
- og:image fallback fetches: $0 (sub-request budget on Workers)
- **Per-enrichment: ~$0.001. 100/org/month cap = ~$0.10/org/mo worst case.**

## Files touched

Search the commit for full detail; the load-bearing ones:

- `src/cf-worker/link-processor/process-link.ts` — router with soft-fallback `catchTags`
- `src/cf-worker/link-processor/durable-object.ts` — passes `xContentEnrichmentEnabled` + `storeId`; wires enrichment layers
- `src/cf-worker/x-enrichment/` (new) — `enricher.ts`, `generator.ts`, `usage.ts`, `errors.ts`, `types.ts`, `services.ts`, `services/thread-provider-noop.live.ts`, full `__tests__/`
- `src/cf-worker/metadata/extractors/twitter.ts` — image-fallback chain with injected og lookup
- `src/lib/plan.ts`, `src/cf-worker/admin/workspaces.ts`, `src/components/admin/...` — `xContentEnrichment` capability + admin override
- `wrangler.jsonc`, `worker-configuration.d.ts` — `ENRICHMENT_USAGE` KV namespace binding

## References

- [[architecture/metadata-extraction]] — convergence point this feature extends
- [[architecture/link-processor]] — pipeline the router sits inside
- [[features/x-bookmark-sync]] — existing Pro X integration; entitlement pattern reused
- `src/cf-worker/billing/service.ts:229-249` — `requireCapability` (used for capability gating)
- `src/cf-worker/weekly-digest/generator.ts` — sibling OpenRouter + Gemini Flash integration
