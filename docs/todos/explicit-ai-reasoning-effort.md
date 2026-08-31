# Set reasoning effort intentionally per AI workload

## Goal

Stop paying the provider's default reasoning level where a lower explicit level
produces equivalent useful output.

## Scope

- Locally evaluate `low` and `none` for the tool-using Assistant, including
  multi-step retrieval and destructive-action selection.
- Locally evaluate `none` for weekly digest, X enrichment, and private chat
  compaction.
- Record reasoning-token usage, output quality, latency, and failures.
- Set each workload explicitly only after its evaluation passes.

Lower effort changes generated reasoning-token volume, not the provider's unit
price. Hard output ceilings remain separate safeguards.

## Decision

- Assistant answer/tool turns use `none` reasoning.
- Weekly digests, X enrichment, and private compaction use `none`.
- The comparison used synthetic prompts with the same tool/schema difficulty;
  production system prompts were not copied into eval code.
- Assistant `none` completed all sampled date-range retrieval, topic search,
  batch, and search-then-archive approval paths without a quality regression
  against `low`.
- Digest and X `none` remained faithful and structured. Compaction `none`
  retained every tested preference, link ID, and completed action.
- Across the sampled calls, lower effort reduced latency, reasoning tokens, and
  provider-reported cost. The temporary evaluator was removed after the run.
