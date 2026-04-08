# Surface LinkProcessorDO errors to monitoring

During the sync bug, errors were logged but never surfaced to any monitoring feed. Links silently failed to sync for days.

## Errors to capture

- `MaterializeError` — PK conflicts in eventlog (corrupted store)
- `ServerAheadError` — only if persistent (single occurrences are normal rebase protocol)
- `processLinkAsync failed` — catch block that resets cachedStore
- `store.commit()` failures (currently swallowed)

## Key constraint

LinkProcessorDO currently does NOT use `AppLayerLive` or `OtelTracingLive`. Would need to wire tracing into the DO's `runEffect` or add it to the layer chain.

## Options

1. **Axiom alerts via OTel** — add error spans from LinkProcessorDO, set up Axiom monitors
2. **Telegram admin alerts** — reuse SourceNotifierLive for error notifications
3. **Structured error logging** — ensure errors use `Effect.logError` with annotations (some use `logSync` which bypasses OTel)
