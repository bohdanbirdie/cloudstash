# Explore ManagedRuntime for LinkProcessorDO

Currently the DO uses `Effect.unsafeMakeSemaphore` as a class field for concurrency control. The `unsafe` prefix means "synchronous construction outside the Effect runtime" — it works, but the DO has a growing number of imperative-to-Effect bridges (`runEffect`, `void runEffect`, `.catch(() => {})`) that could be cleaner with a managed runtime.

## What to investigate

- Could `ManagedRuntime` own the semaphore, ProgressTracker, and SourceNotifier layer as a single long-lived runtime?
- Would `runtime.runPromise` replace all the scattered `runEffect` calls?
- How does `ManagedRuntime` interact with DO eviction? Does it need explicit disposal?
- Would this let us remove the imperative subscription callbacks entirely and use Effect streams/queues instead?

## Current state

- `Effect.unsafeMakeSemaphore(5)` as class field — controls link processing concurrency
- `runEffect(...)` called in 4 places: subscription callback, `sendProgressDraft`, `notifyResults`, `cancelStaleLinks`
- `void runEffect(...)` in the subscription to satisfy the linter (fire-and-forget promise)
- The subscription callback is the imperative-to-Effect boundary

## Relevant files

- `src/cf-worker/link-processor/durable-object.ts`
- `src/cf-worker/link-processor/logger.ts` (runEffect helper)
