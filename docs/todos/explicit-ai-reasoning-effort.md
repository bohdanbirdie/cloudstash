# Set reasoning effort intentionally per AI workload

## Goal

Stop paying the provider's default reasoning level where a lower explicit level
produces equivalent useful output.

## Scope

- Locally evaluate `low` for the tool-using Assistant against the current
  default, including multi-step retrieval and destructive-action selection.
- Locally evaluate `none` for weekly digest, X enrichment, and private chat
  compaction.
- Record reasoning-token usage, output quality, latency, and failures.
- Set each workload explicitly only after its evaluation passes.

Lower effort changes generated reasoning-token volume, not the provider's unit
price. Hard output ceilings remain separate safeguards.

## Decision

- Assistant answer/tool turns use `low` reasoning.
- Weekly digests, X enrichment, and private compaction use `none`.
- The comparison used synthetic prompts with the same tool/schema difficulty;
  production system prompts were not copied into eval code.
- Assistant `low` selected the same correct tool paths as the provider default
  for date-range retrieval, topic search, and search-then-archive approval.
- Digest and X `none` remained faithful and structured. Compaction `none`
  retained every tested preference, link ID, and completed action.
- Across the sampled calls, lower effort reduced latency, reasoning tokens, and
  provider-reported cost. The temporary evaluator was removed after the run.
