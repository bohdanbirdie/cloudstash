# Set reasoning effort by workload

Status: accepted

## Context

The pinned OpenRouter model defaults to a nonzero reasoning effort. Cloudstash
used that implicit default for interactive tool use, weekly digest generation,
X structured enrichment, and private conversation compaction even though those
workloads have different needs.

## Evidence and Argument

A local synthetic-prompt comparison exercised date-range retrieval, topic
search, search-then-archive approval, digest prose, standalone and quoted X
summaries, and compaction of preferences plus completed actions. Assistant
`low` selected the same tools and approval path as the default. `none` produced
complete digest, enrichment, and compaction outputs. Lower settings reduced
reasoning tokens, latency, and provider-reported cost in every sampled workload.

## Options

| Option                                  | Tradeoff                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| Keep the provider default               | No configuration, but pays for unmeasured reasoning and can change upstream.   |
| Use `none` for every workload           | Lowest overhead, but weakens multi-step interactive tool selection.            |
| Use `low` for chat and `none` elsewhere | Keeps tool planning while removing reasoning from bounded transformation work. |

## Decision

Set Assistant answer/tool turns to `low`. Set weekly digest, X enrichment, and
private compaction to `none`. Keep hard input/output envelopes independent of
reasoning effort.

## Consequences

- Provider-default changes no longer silently alter reasoning spend or latency.
- Tool-selection regressions require focused evals before lowering Assistant to
  `none`.
- Model changes require rerunning the same workload-shaped comparison rather
  than assuming these settings transfer.
