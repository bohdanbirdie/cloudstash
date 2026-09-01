# Measure chat retrieval before reducing results

Status: accepted

## Context

Assistant search returns at most 20 ranked, reduced-shape link records. Smaller
tool results could reduce repeated model input, but changing the limit without
evidence could make saved links harder to find.

## Evidence and Argument

OpenRouter already reports the actual cost of each completed generation. A
request-local counter can correlate that spend with aggregate retrieval calls,
items, and serialized result size without storing prompts or link content. It
adds no storage read, write, or network operation.

## Options

| Option                                  | Tradeoff                                                      |
| --------------------------------------- | ------------------------------------------------------------- |
| Reduce results immediately              | Saves unknown input cost but risks search recall.             |
| Log complete tool inputs and outputs    | Rich evidence but violates telemetry minimization.            |
| Measure only aggregate retrieval shapes | Preserves quality and privacy while exposing the actual cost. |

## Decision

Record per-answer aggregate list/search/get call counts, returned item count,
and serialized result characters beside provider usage and spend. Cap measured
characters per call and never log queries, titles, URLs, summaries, or tool
results. Keep the 20-result ranked search limit until production telemetry
demonstrates material waste.

## Consequences

- Search behavior and result quality do not change.
- Measurement adds no durable state or billable Cloudflare operation.
- Repeated retrieval and payload size can be compared with actual provider
  spend.
- Any later payload reduction requires a separate evidence-backed decision.
