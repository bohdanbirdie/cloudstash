# Bound AI prompt and output envelopes

## Goal

Prevent pathological inference inputs while preserving useful summaries,
digests, and tag reuse.

## Scope

- Cap the existing-tag vocabulary supplied to basic summaries and X
  enrichment at 100 deterministic entries.
- Cap weekly-digest input at 100 links selected across the complete week rather
  than taking only the newest links.
- Give the digest an explicit output ceiling, but validate 256 tokens against
  representative rendered digests before accepting it; use a larger ceiling if
  256 harms clarity or value.
- Evaluate reducing the basic-summary ceiling from 512 to 384 tokens.
- Evaluate X enrichment together with `AI-13` because reasoning tokens share
  its output budget.

## Non-goals

- Do not batch unrelated inference work.
- Do not truncate content that is already safely bounded without measured need.

## Decision

- Existing-tag vocabularies are alphabetically stable and capped at 100.
- Digest candidates are ordered chronologically, then at most 100 are sampled
  evenly across the full week.
- Digest fields and tag counts are bounded at the provider boundary, exact URLs
  that cannot fit are omitted rather than truncated, and the complete user
  prompt is capped at 24,000 characters.
- Basic summaries use a 384-token output ceiling.
- Weekly digests use a 384-token output ceiling. A local six-generation
  comparison covered 12-, 50-, and 100-link weeks at 256 and 384 tokens. One
  256-token response ended mid-sentence with `finishReason: length`; all
  384-token responses completed normally with 2–3 cited links and 145–314
  output tokens.
- Digest prompts explicitly treat all saved-link fields as untrusted data.
- X enrichment retains its existing output ceiling until `AI-13` evaluates its
  reasoning budget separately.
