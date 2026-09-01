# Reduce Assistant inference overhead

## Delivered

- Use explicit `none` reasoning after a focused local tool-selection comparison.
- Expand raw model context to 150 messages while retaining the independent
  24,000-token compaction trigger and 12-message verbatim tail.
- Keep 20 ranked search results but replace duplicate description/summary fields
  with one bounded context field; full details remain available through
  `getLink`.
- Keep the existing 2,000-token output and five-step ceilings plus stable
  provider session routing.

The evaluation rationale and current envelope live in retrieval decision 0008.
