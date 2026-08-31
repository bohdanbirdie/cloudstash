# Reduce Assistant inference overhead

Status: accepted

## Context

The Assistant used `low` reasoning, sent only the last 30 uncompacted messages,
and returned both description and summary for every one of up to 20 search
results. The short window could lose useful search/action context, while the
duplicated result text and reasoning tokens increased provider input without
changing server-side search ranking.

This decision supersedes the Assistant-effort portion of decision 0005 and the
payload-preservation conclusion of decision 0007. Their workload-specific and
measurement-first principles remain in force.

## Evidence and Argument

A temporary local evaluation used synthetic saved-link data and the pinned
production model without retaining API keys or evaluation code:

- `none` reasoning completed all 14 representative search, date, batch, and
  destructive-action cases, matched `low` quality, and reduced output,
  latency, and provider-reported usage.
- A 30-message raw window lost facts in all three long-context cases. Full
  39-message context or a compacted prefix plus recent tail retained all three.
- Twenty compact results containing identity, rank, and one context field
  matched the full-payload result quality in all sampled retrieval cases while
  materially reducing serialized model input.
- Reducing the output ceiling below 2,000 tokens did not improve the tested
  path and introduced a duplicate tool call in one comparison.

## Options

| Option                                                                   | Tradeoffs                                                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Keep `low`, 30 messages, and duplicate result text                       | Lowest change risk, but preserves measured waste and the observed memory failures.                                  |
| Lower reasoning and shrink result count                                  | Saves input, but directly weakens retrieval recall.                                                                 |
| Use `none`, a larger dual-trigger window, and compact 20-result payloads | Preserves ranked recall and visible history while reducing model-only overhead; requires explicit compaction tests. |

## Decision

Use explicit `none` reasoning for interactive Assistant turns. Keep the
2,000-token per-step output ceiling, five-step ceiling, pinned model, stable
provider session identity, and 20-result ranked search ceiling.

Let the model see up to 150 uncompacted UI messages. Trigger private compaction
when either that count is exceeded or estimated context exceeds 24,000 tokens;
retain the most recent 12 messages verbatim. The complete Agents SDK transcript
remains visible and persisted independently of model context.

Return ID, URL, title, score, and one summary-first/description-fallback context
field of at most 600 characters for each search result. Fetch full metadata only
through `getLink` when a later step needs it.

## Consequences

- Search ranking quality is unchanged because ranking remains server-side.
- Ambiguous query formulation remains the regression surface for future model
  or reasoning changes and must stay in focused evaluations.
- Long conversations compact later, while unusually large messages still
  compact at the token threshold.
- Retrieval telemetry remains useful for detecting repeated calls and future
  payload drift without logging private content.
