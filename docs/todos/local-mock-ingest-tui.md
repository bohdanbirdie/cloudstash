# Local mock-ingest TUI — endless fake links for testing the ingest API

A personal dev tool for exercising the public ingest path (`POST /api/ingest`) locally without hunting for real, not-yet-saved internet URLs. Generates an endless supply of **unique, locally-fetchable** pages so every ingest is a genuinely new link (the store dedups by URL), and supports **burst** saving (10 / 50 / 500 …) to stress the queue → LinkProcessorDO → SyncBackend path. Grew out of `scripts/test-ingest.ts` (single-link smoke test) while validating the cold-DO-stranding fix.

**Status:** implemented — `scripts/mock-ingest/` (`index.ts` TUI, `server.ts` mock content server, `client.ts` ingest/reconcile, `content.ts` page generator). Effect-idiomatic (Schema-decoded responses + `Schema.TaggedError`, `Effect.forEach` concurrency, `Stream.asyncPush` keypress TUI, scoped `Effect.acquireRelease` servers — mirrors `scripts/check-pricing.ts`). Verified working (dry-run burst → durability count). Personal tool; correctness > polish, doesn't need to be perfect.

## Why

- Real internet URLs dedup after the first save (`ingestLink` → `findByUrl` → `"duplicate"`), so repeat testing needs fresh URLs.
- We want to watch durability/sync and processing at volume without manually pasting links.
- The cloudstash worker fetches link content with **plain `fetch()`** (`src/cf-worker/metadata/service.ts:43`, `src/cf-worker/link-processor/content-extractor.ts:98`) — not a Browser Rendering binding — so a `127.0.0.1` mock server **is reachable** by the worker in local dev. Local pages therefore get real metadata + content extraction.
- **Token cost at volume:** the tool sends real ingests, so bursts currently run **real** OpenRouter/Workers AI summaries. A companion token-free stub layer (`STUB_AI_SUMMARIES` + a fake AI summary layer) was prototyped alongside this but **reverted** with the cold-DO-stranding fix — re-add it as a separate change if burst testing gets expensive.

## Components

1. **Mock content server** (its own bun HTTP server, background; default `127.0.0.1:4321`, port configurable).
   - Serves a unique realistic HTML page per id at e.g. `GET /page/:id` — `<title>`, `<meta name="description">`, OG tags (`og:title`/`og:description`/`og:image`), and a few paragraphs of body text, varied per id (deterministic from the id is fine; no randomness primitives needed beyond an incrementing counter + a small word bank).
   - A small `og:image` can point back to the same server (e.g. `/img/:id` returning a tiny SVG/PNG) or any static placeholder.
   - Bind and advertise URLs as `127.0.0.1` (not `localhost`) to avoid resolver mismatches with the worker.

2. **TUI** (zero-dependency — bun/Node `process.stdin` raw-mode keypress menu; **do NOT add `ink`/React or any new dep** — the repo has a supply-chain cooldown and this is a throwaway dev tool).
   - Menu actions: send **1** link; burst **10 / 50 / 500**; **custom N**; quit.
   - Each "link" = start (or reuse) the mock server, mint a fresh `/page/:id` URL, `POST /api/ingest`.
   - Burst: bounded concurrency (~10–20 in flight), live progress (sent / queued-ack / failed), then a **reconciliation** pass — `GET /api/links` (paginate) and report how many of the burst's unique URLs actually landed on the server (durability count). Keep per-link processing/AI state out of the pass/fail — durability (link present) is the signal; AI summary is best-effort.

3. **CLI args / config**
   - Arg 1 = **API key** (required; passed as `Authorization: Bearer <key>`).
   - App origin: env `CLOUDSTASH_ORIGIN`, default `http://127.0.0.1:3000`.
   - Mock server port: env or flag, default `4321`.

## Constraints

- **NEVER start/stop the cloudstash dev server** — the user runs `bun dev` continuously. The tool runs only its **own** mock content server in the background, and talks to the already-running app at `CLOUDSTASH_ORIGIN`.
- **bun**, not npm. **No new dependencies** (zero-dep TUI). Lives under `scripts/mock-ingest/`.
- Must pass `bun run check` (oxlint/oxfmt). `scripts/` is excluded from `tsconfig` typecheck, so no type-gate, but keep it clean TS that runs under `bun`.
- The ingest API is Plus+-gated — a free local org returns 402; surface that status plainly (don't swallow it).

## What the builder can self-verify vs. not

- **Can:** the mock server serves valid, unique pages (curl it); the TUI renders, navigates, and constructs correct `POST`/`GET` requests; burst concurrency + reconciliation logic against a stubbed/echo endpoint.
- **Cannot (needs the user):** full end-to-end ingest — requires the user's running dev server **and** a valid Plus+ API key (passed as arg 1). Document the exact run command; the user does the live run.

## Run (target UX)

```bash
bun scripts/mock-ingest/index.ts <API_KEY>
# then pick: 1 / 10 / 50 / 500 / custom / quit
```
