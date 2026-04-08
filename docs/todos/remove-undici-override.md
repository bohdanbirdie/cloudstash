# Remove undici 7.18.2 override

Override works around a regression in undici 7.24.4 (bundled with miniflare/wrangler): any request with a body that gets 401 crashes with `TypeError: fetch failed`.

Root cause: `isTraversableNavigable()` returns `true` unconditionally, triggering browser-only credential-retry logic.

## When to remove

Once upstream fix lands in undici (nodejs/undici#4910) and miniflare picks up the fixed version.

## How to verify

1. Delete `"overrides"` block from `package.json`
2. `rm -rf node_modules bun.lock && bun install`
3. `curl -X POST http://localhost:3000/api/ingest -H "Content-Type: application/json" -d '{"url":"https://example.com"}'` should return 401, not 500

## Upstream

- cloudflare/workers-sdk#12967
- nodejs/undici#4910 (still open)
