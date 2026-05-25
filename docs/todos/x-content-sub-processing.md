# X (Twitter) content enrichment — Pro feature

Richer AI summaries for bookmarked tweets. Pro-only, gated by the `xContentEnrichment` capability, hard-capped at 100 enrichments per org per month, gracefully degrades to the basic summarizer on any failure.

## How it works

`processLink` routes to an enriched summarizer up-front when all three conditions hold:

- `xContentEnrichmentEnabled` (capability check via tier defaults + admin overrides)
- The link has a `storeId` (i.e. belongs to an org)
- `isXTweetUrl(url)` matches `x.com / twitter.com /status/<id>`

Otherwise the existing basic summarizer runs unchanged. Either branch ends in a single `linkSummarized` commit whose `model` field distinguishes basic (`AI_MODEL`) from enriched (`ENRICHMENT_MODEL`). Telegram delivery and every other downstream subscriber stays event-driven on the same commit.

```
LinkProcessor (single pass)
  └─ if xContentEnrichmentEnabled && hasStoreId && isXTweetUrl(url):
        enrichSummary
          ├─ EnrichmentUsage.current (KV) — bail with BudgetExhausted if ≥ cap
          ├─ ThreadProvider.fetchContext(url)  ← syndication-only impl
          ├─ EnrichmentGenerator.generate({url, context, existingTags})
          │     OpenRouter generateObject → google/gemini-2.5-flash
          │     returns {summary, suggestedTags}
          └─ EnrichmentUsage.increment (KV)   ← only on success
        catchTags → all enrichment errors fall back to basic
     else:
        AiSummaryGenerator.generate (existing basic path)
  └─ emit linkSummarized with model = ENRICHMENT_MODEL or AI_MODEL
```

The router catches 10 enrichment error tags individually (`EnrichmentBudgetExhausted`, six `ThreadProvider*` variants, `EnrichmentGenerate`, `EnrichmentUsageGet`, `EnrichmentUsagePut`), each logging structured context before delegating to the basic summarizer. The `EnrichmentUsage` counter is only incremented on a successful generation.

## Components

- **`ThreadProvider`** Effect.Service abstracting tweet-context retrieval. Live impl pulls the bookmarked tweet via `cdn.syndication.twimg.com/tweet-result` with a 10s timeout; returns root text, quoted body, author, conversation id, external URLs. Branded `XTweetId` / `XUsername`. Six tagged error variants for invalid URL / transport / HTTP / response parse / empty / timeout.
- **`EnrichmentGenerator`** Effect.Service running Vercel AI SDK `generateObject` against `google/gemini-2.5-flash` via OpenRouter. Prompt rules forbid fabrication (every fact in the summary must appear in the input). Returns `{summary, suggestedTags}`.
- **`EnrichmentUsage`** Effect.Service backed by the `ENRICHMENT_USAGE` KV namespace. Counter keyed `enrichment:{orgId}:{YYYY-MM}` with a 70-day TTL. Split `Get` / `Put` tagged errors so KV failures route distinctly through `catchTags`.
- **Image-fallback chain** in the X metadata extractor (`pickImage(data, tweetUrl, lookupOgImage)`): parent media → quoted-tweet media → first non-twitter linked-URL og:image → tweet-page og:image. Decision logic takes the og lookup as an injected function, so tests stub it with `vi.fn` and assert call order without HTMLRewriter.

## Configuration

- **Capability:** `xContentEnrichment: boolean` on `TierCapabilities` (`free=false, plus=false, pro=true`). Admin override via `BOOLEAN_CAPABILITY_KEYS`.
- **Model:** `ENRICHMENT_MODEL = "google/gemini-2.5-flash"` (`src/cf-worker/x-enrichment/types.ts`).
- **Cap:** `MONTHLY_ENRICHMENT_CAP = 100`.
- **KV binding:** `ENRICHMENT_USAGE` in `wrangler.jsonc`.

## Files

Load-bearing paths:

- `src/cf-worker/link-processor/process-link.ts` — router with soft-fallback `catchTags`
- `src/cf-worker/link-processor/durable-object.ts` — passes `xContentEnrichmentEnabled` + `storeId`; wires enrichment layers into the live layer chain
- `src/cf-worker/x-enrichment/` — `enricher.ts`, `generator.ts`, `usage.ts`, `errors.ts`, `types.ts`, `services.ts`, `services/thread-provider-noop.live.ts`, full `__tests__/`
- `src/cf-worker/metadata/extractors/twitter.ts` — image-fallback chain with injected og lookup
- `src/lib/plan.ts`, `src/cf-worker/admin/workspaces.ts`, `src/components/admin/...` — capability wiring + admin override

## References

- [[architecture/metadata-extraction]] — convergence point this feature extends
- [[architecture/link-processor]] — pipeline the router sits inside
- [[features/x-bookmark-sync]] — existing Pro X integration; entitlement pattern reused
- `src/cf-worker/billing/service.ts` — `requireCapability` (used for capability gating)
- `src/cf-worker/weekly-digest/generator.ts` — sibling OpenRouter + Gemini Flash integration
