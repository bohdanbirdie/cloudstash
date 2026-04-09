# Review stateful SQLite ProgressTracker

The ProgressTracker was made stateless (derives draft from livestore queries). Review whether a stateful SQLite-backed approach would be better for performance.

## Context

The stateless approach queries DO-local SQLite on every `sendProgressDraft` call (3x per link lifecycle: register, updateStage, unregister). Each query joins `links` and `linkProcessingStatus` tables filtered by `source = 'telegram'` and non-terminal status.

## What to evaluate

- Are the per-draft queries measurably slow under load (e.g. 5+ concurrent telegram links)?
- Would a dedicated `link_progress` SQLite table with direct inserts/deletes be faster?
- Is the query cost worth it vs the simplicity of zero additional storage writes?
- Consider: a new table adds 3 writes per link lifecycle + schema migration + new events

## When to revisit

After real usage data shows whether the query approach has latency issues with draft message rendering.

## Relevant files

- `src/cf-worker/link-processor/progress-draft.ts`
- `src/cf-worker/link-processor/durable-object.ts`
