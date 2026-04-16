# Surface LinkProcessorDO errors to monitoring

**Status:** Done

## What was done

Wired `OtelTracingLive(env)` into LinkProcessorDO's `runEffect` so all `Effect.logError`, `Effect.logWarning`, `Effect.logInfo`, and `Effect.withSpan` calls now export spans and logs to Axiom via the OTel pipeline.

### Changes

- `src/cf-worker/link-processor/logger.ts` — `runEffect` now takes `env: Env` and provides a merged layer of the custom logger + `OtelTracingLive(env)`
- `src/cf-worker/link-processor/durable-object.ts` — all 5 `runEffect(...)` call sites updated to pass `this.env`

### What's now monitored

- `processLinkEffect` failures (defects) — via `Effect.logError` + `Effect.withSpan`
- `AiCallError` and content extraction errors — via `Effect.logError` / `Effect.logWarning`
- `cancelStaleLinks` failures — via Effect error channel
- `sendProgressDraft` / `notifyResult` failures — via `Effect.logWarning` / `Effect.catchAll`
- All `Effect.withSpan` calls (e.g. `LinkProcessorDO.processLinkEffect`, `LinkProcessorDO.sendProgressDraft`)

### Remaining edge cases (acceptable)

- `.catch()` handlers on Promise boundaries still use `logSync` (console.error only) — these fire only when the Effect itself defected past all catch layers, which is extremely rare
- `store.commit()` at line 345 has no explicit error handling, but throws are caught by `catchAllDefect` on the outer `processLinkEffect` pipe
