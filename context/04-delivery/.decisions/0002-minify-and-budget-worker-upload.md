# Minify and budget the Worker upload independently

Status: accepted

## Context

Cloudstash ships one large Cloudflare Worker containing the web server, APIs,
Durable Objects, LiveStore, extraction, MCP, authentication, and email code.
Vite treats that environment as server/SSR output and does not minify it by
default. The August 2026 toolchain build measured 2,963.23 KiB gzip, leaving
about 109 KiB below the Workers Free upload boundary.

## Evidence and Argument

- [`verify-bundle.ts`](../../../scripts/verify-bundle.ts) uses
  `wrangler deploy --dry-run` to measure the platform upload rather than the
  separate static-assets directory.
- Worker-only Oxc minification reduced the same upload from 12,632.11 KiB raw /
  2,963.23 KiB gzip to 6,268.45 KiB raw / 1,867.80 KiB gzip.
- [`content-extractor.ts`](../../../src/cf-worker/link-processor/content-extractor.ts)
  requires Defuddle and LinkeDOM for server-side content extraction; removing
  the direct LinkeDOM import would make Defuddle load it internally rather than
  remove it from the upload.
- Dynamic imports defer module evaluation but do not remove modules from the
  uploaded Worker.
- A size report without a failing budget permits an ordinary dependency update
  to cross the deployment-plan boundary unnoticed.

## Options

| Option                                                          | Tradeoffs                                                                                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep unminified output and upgrade the Cloudflare plan          | Avoids build changes, but pays to preserve avoidable bytes and leaves startup work larger.                                                      |
| Remove or replace extraction dependencies                       | Could save substantial size, but changes a product capability and risks extraction quality.                                                     |
| Split extraction or other subsystems into service-bound Workers | Preserves features and creates independent size ceilings, but adds deployment, binding, and failure-boundary complexity.                        |
| Minify only the Worker and enforce a pre-limit budget           | Retains the architecture and dependencies, produces the largest measured low-risk reduction, and fails before deployment headroom is exhausted. |

## Decision

Oxc-minify the `cloudstash` Worker environment without changing client build
defaults. Keep Defuddle and LinkeDOM in the main Worker. Certify the actual
Wrangler upload at build time with a 2,700 KiB gzip budget and the platform raw
limit, and smoke-test the generated minified Worker through D1 authentication
and an authenticated SyncBackendDO WebSocket upgrade. Reconsider service
splitting only if measured growth approaches the budget after minification.
