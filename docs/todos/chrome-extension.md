# Chrome extension (Livestore-as-client)

A browser extension to save and browse cloudstash links from any page. Same Livestore client setup as the web app — extension is a peer client, not a thin HTTP wrapper.

## Decision: run Livestore inside the extension, not HTTP ingest

The Raycast extension uses `POST /api/ingest` (see `src/cf-worker/connect/`, `src/cf-worker/ingest/service.ts`) because it can't run a browser-style Livestore client. Chrome can. Going Livestore-as-client means:

- Zero new server endpoints per feature. Save, tag, edit, archive, "already saved" badge — all just `store.commit(events.x)`.
- Reactive UI in the side panel reads the local store, same as the web app.
- Offline edits, sync on reconnect — for free.
- Same auth (better-auth cookie), same `storeId` (= `orgId`).

Trade-off accepted: one extra OPFS partition + one extra WS connection per installed user. Tiny in absolute terms.

If the extension were ever truly "save button only," HTTP ingest would win on simplicity — but every realistic future feature pushes toward shared Livestore.

## Architecture

Extension origin is `chrome-extension://<id>` — a _separate_ origin from `app.cloudstash.io`. SharedWorker and OPFS are origin-scoped, so the extension gets its own coordination + storage, isolated from the web app. Sync still converges through `SyncBackendDO`.

Contexts and roles:

```
background.ts (MV3 service worker)
  • handles toolbar click → opens side panel
  • ensures offscreen document exists for background sync
  • context menus ("Save this link"), keyboard shortcuts
  • CANNOT host the store (no SharedWorker in service workers — whatwg/html#8362)

offscreen.html (chrome.offscreen, reason: WORKERS)
  • hosts the Livestore SharedWorker + the WS connection to /sync
  • persists indefinitely while open (only AUDIO_PLAYBACK has an auto-timeout)
  • keeps sync alive even when no UI is visible

side-panel.html (chrome.sidePanel)
  • React app — reuses components/schema from src/
  • connects to the SAME SharedWorker as offscreen (same origin)
  • main UX surface: full link list, search, tag, save current tab

popup.html (optional)
  • tiny "save current tab" affordance for users who don't want the side panel open
  • also a SharedWorker client (not a host — popup dies when user clicks away)

content scripts (optional, later)
  • "already saved" badge / hover affordance on links in pages
  • read from the local store via runtime messaging to offscreen
```

## Repo structure: bun workspace, not full monorepo

Don't move `src/` to `apps/web/src/` (multi-day refactor, breaks every import). Don't extract `packages/livestore-shared/` yet (premature). Just register a workspace:

```
cloudstash/
  package.json              # add: "workspaces": ["apps/*"]
  src/                      # untouched
    livestore/schema.ts     # the shared piece — imported by extension
  apps/
    extension/
      package.json          # wxt + @wxt-dev/module-react + chrome types
      wxt.config.ts
      tsconfig.json         # paths: { "@web/*": ["../../src/*"] }
      entrypoints/
        background.ts
        side-panel/{index.html, main.tsx}
        offscreen/{index.html, main.ts}
        popup/{index.html, main.tsx}
      public/icons/
```

Extension imports schema via `import { schema } from "@web/livestore/schema"`. Schema changes auto-propagate on rebuild — no publishing, no versioning. When a third client lands (mobile/electron), upgrade to extracted packages then.

Why NOT separate repo (à la Raycast):

- Raycast can't share Livestore so HTTP-only is fine. Chrome must share the schema — different release cadences become a tax.
- Same package manager (bun), same build (Vite), same TS — composes cleanly in one repo.

## Tooling: WXT

[wxt.dev](https://wxt.dev) — Vite-based MV3 framework. File-based entrypoints generate the manifest, HMR works in all contexts (including content scripts), `wxt zip` produces the Chrome Web Store artifact, MV2 Firefox build is free. React 19 supported via `@wxt-dev/module-react`. Tailwind 4 plugin drops in unchanged.

Alternatives considered:

- **CRXJS Vite plugin** — bare Vite plugin, you write `manifest.json` by hand. More control, more boilerplate. Fine if WXT's conventions ever become a liability.
- **Plasmo** — heavier React-opinionated framework, drags in its own routing/UI. Overkill.
- **Hand-rolled** — don't.

## Cross-checked technical findings

Verified against `local/readonly-llm-lookup/livestore/` source and Chrome extension docs.

**Confirmed:**

- `@livestore/adapter-web` uses SharedWorker as singleton coordinator; per-tab dedicated Worker talks to it via MessagePort. Gate is `canUseSharedWorker()` = `typeof SharedWorker !== 'undefined'` (`packages/@livestore/adapter-web/src/web-worker/client-session/persisted-adapter.ts:54`).
- MV3 service worker cannot spawn SharedWorker — web-platform gap (whatwg/html#8362), not extension-specific. Hence the offscreen-doc pattern.
- OPFS works at `chrome-extension://<id>` origin in page contexts. Add `unlimitedStorage` permission to reduce eviction risk. Caveat: DevTools / OPFS Explorer can't inspect extension OPFS — debugging is painful.
- `/sync` handler doesn't reject by `Origin`. `@livestore/sync-cf/cf-worker` passes headers to user-supplied `validatePayload`; our `src/cf-worker/sync/index.ts:85-128` only checks the cookie. So `Origin: chrome-extension://<id>` is accepted.
- `makeWsSync` client puts `storeId` and optional **`payload` query param** in the WS URL — no custom headers or subprotocols (`packages/@livestore/sync-cf/src/client/transport/ws-rpc-client.ts:69-80`). Two viable auth paths: (a) browser auto-attaches better-auth cookie, (b) auth token via `payload` param read in `validatePayload`.
- Offscreen documents with `reasons: ['WORKERS']` persist indefinitely until `closeDocument()` is called. Only `AUDIO_PLAYBACK` has an auto-timeout (30s).

**Open / spike required:**

- **WebSocket cookies from `chrome-extension://` origin to `app.cloudstash.io` with `host_permissions`** — Chrome docs say extension requests with host permissions are treated as same-site for cookies, but that line is in HTTP context; WebSocket-in-extensions docs say nothing about cookies. Long-standing crbug 947413 covers this exact ambiguity. **Probably works but must verify.**
  - Fallback if it fails: `chrome.cookies.get()` (exposes HttpOnly cookies to the extension with host permission) → encode into WS `payload` query param → parse server-side in `validatePayload`. Clean, no architectural change.
- **SharedWorker in `chrome.sidePanel`** — side panel is an extension page so it should behave like options/popup, but no Chrome doc explicitly blesses it.

## The verification spike (do this before committing significant work)

Two cheap experiments, ~30 min total:

1. **WS+cookie test.** Offscreen doc opens `wss://app.cloudstash.io/sync?storeId=...`. Add log in `src/cf-worker/sync/index.ts:91` for the `Cookie` header. Verify better-auth session cookie arrives.
2. **SharedWorker-in-side-panel test.** Side panel and offscreen doc both call `new SharedWorker(chrome.runtime.getURL('sw.js'), { type: 'module' })`. Confirm both succeed and share one instance (port count = 2).

If both pass → ship as planned. If WS cookies fail → switch to `payload`-param auth (5 lines changed, no architecture change). If side-panel SharedWorker fails (very unlikely) → host store only in offscreen, side panel reads via `chrome.runtime` messaging.

## Server-side changes

Likely zero. Possibly:

- **better-auth `trustedOrigins`**: if we ever do `fetch()` against `/api/auth/*` from the extension, add `chrome-extension://<extension-id>` to `trustedOrigins`. Not needed for the WS sync path.
- **`SyncBackendDO`**: no change. Cookie validation in `src/cf-worker/sync/index.ts:90-100` accepts the extension's WS handshake unchanged.

## Auth bootstrap UX

First run with no cookie: side panel shows "Sign in to Cloudstash" → opens `app.cloudstash.io` in a new tab → user signs in → cookies populate → extension reconnects automatically. Same pattern as Notion Web Clipper / Slack extension. No new auth code in the worker.

## Files this will touch

- New: `apps/extension/` workspace (entire structure above)
- `package.json` (root): add `"workspaces": ["apps/*"]`
- `src/livestore.worker.ts`-equivalent inside `apps/extension/entrypoints/offscreen/` — near-identical, but absolute `wss://app.cloudstash.io/sync` URL instead of `${globalThis.location.origin}/sync` (extension origin is `chrome-extension://...`, not the API)
- Optionally: extract a small shared helper in `src/livestore/` if any duplication grows beyond ~20 lines
- No `src/cf-worker/` changes expected (verify after the spike)

## Triggers to revisit

- If WS+cookie spike fails → switch to `payload`-param auth (already designed, just executing).
- If a third client lands (mobile/electron) → upgrade workspace into "real" monorepo with `packages/livestore-shared/`.
- If extension wants to talk to `/api/*` for non-sync reasons → add `trustedOrigins` to better-auth + verify CORS.
- If Livestore upstream adds a lighter adapter (single-tab without SharedWorker requirements) → reconsider offscreen-doc pattern, simpler architecture might become available.

## Out of scope for v1

- Content scripts ("already saved" badges, hover affordances) — defer to v2 once core save flow ships.
- Firefox build — WXT supports it but the Cloudflare-side cookie behavior may differ; ship Chrome first.
- Cross-device sync of extension-specific settings — use `chrome.storage.sync` if needed; doesn't go through Livestore.
