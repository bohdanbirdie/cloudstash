# Measure chat retrieval cost before changing search

## Goal

Protect Assistant search quality while establishing whether tool-result payloads
are a material cost source.

## Scope

- Observe search/list/get tool-call counts, bounded returned character volume,
  and provider-reported spend without logging private link content.
- Keep the current ranked maximum of 20 reduced-shape search results.
- Reconsider result count or metadata truncation only if production evidence
  shows material repeated input cost.

## Decisions already made

- Do not add a content-hash or cross-user inference cache. Exact-URL saves,
  unique URL storage, and processing state already prevent ordinary duplicate
  inference; the remaining edge cases do not justify privacy and freshness
  complexity.
- Do not batch unrelated inference requests. The orchestration and partial
  failure complexity outweigh expected savings.

## Implemented

- Each Assistant answer aggregates list/search/get call counts, returned item
  count, and serialized result characters into the existing provider-usage log.
- Character measurement is capped at 100,000 per retrieval call and records how
  often the cap was reached.
- Queries and link content are never logged.
- Search remains ranked and capped at 20 results. Changing that envelope now
  would trade recall for savings that have not been demonstrated.
