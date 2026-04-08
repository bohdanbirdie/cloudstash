# Make Queue Configuration Explicit in Code

Queue names (`cloudstash-link-queue`, `cloudstash-link-dlq`) and consumer settings (`max_batch_size`, `max_concurrency`) are only in `wrangler.toml` with no constants or comments tying them to the code that depends on them.

## What to do

Add named constants or config references in the queue handler code so the coupling between `wrangler.toml` config and `src/cf-worker/queue-handler.ts` is visible. Currently the queue consumer just receives messages — there's no indication in the code what queue it's bound to or what settings affect its behavior.

## Relevant files

- `wrangler.toml` — queue producer/consumer config (lines 62-69)
- `src/cf-worker/queue-handler.ts` — queue consumer logic
- `src/cf-worker/link-processor/durable-object.ts` — `ingestAndProcess()` called by consumer
