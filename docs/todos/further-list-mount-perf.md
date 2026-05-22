# Further list-mount perf improvements

See [[app-redesign|redesign doc]] "Further list-mount perf" open question.

Baseline: 180ms longtask for 241 links on **first route mount** (distinct from held-key nav perf, which landed separately — see [[done/held-key-nav-perf|Held-key nav perf]]).

## Profiling

Chrome profiling shows SQL is NOT the bottleneck (Livestore `useQuery` is 14ms).

## Leverage points (if returning)

- Flatten per-card DOM (currently 10+ fiber levels)
- Query pagination with LIMIT + load-more
- `startTransition` to chunk the longtask
