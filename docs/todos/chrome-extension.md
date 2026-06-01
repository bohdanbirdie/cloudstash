# Chrome extension (Livestore-as-client)

A browser extension to save and browse cloudstash links from any page. Same Livestore client setup as the web app — extension is a peer client, not a thin HTTP wrapper.

**Publishing checklist:** [[chrome-extension-publishing]].

## Shipped (2026-05-28)

Confirmed working end-to-end on Chrome stable (2026-05-29): stable ID, automatic session handoff, and link sync all verified locally. **The extension is FREE (2026-05-30)** — no capability gate on connect/sync; the popup also loads the user's Google avatar + saved-site favicons. Two decisions below diverged from the spike-era plan — **this section is the source of truth**; the spike notes further down are kept for history.

**Auth: paired API key, handed off automatically (no codes as of 2026-05-29).** The key is still a Raycast-style API key, but the manual UUID-code/exchange flow was removed in favor of a seamless `externally_connectable` handoff:

- The extension manifest pins a stable ID via `key` (`apps/extension/wxt.config.ts`; public key committed, private key in `apps/extension/.keys/`, gitignored). Dev/prod ID: `eelfhpgegemfgccaakcmfgldcaojadfj`.
- The popup's "Connect" button opens `/connect/extension` in the app. That page (cookie-authed) **pings** the extension via `chrome.runtime.sendMessage(EXT_ID, …)`, mints the key (`POST /api/connect/extension` → returns `{ apiKey, orgId }` directly — no verification row), and **pushes** it to the extension (`chrome.runtime.onMessageExternal` in `background.ts`), which stores it. Zero codes.
- App-side messaging: `src/lib/extension-connect.ts` (`pingExtension`/`sendCredsToExtension`, `EXTENSION_ID`). Extension-side: `decodeExternalMessage` in `lib/messages.ts`, handlers in `background.ts`. The key still rides the sync `payload` param; server validation is the single path in `src/cf-worker/sync/validate-payload.ts`, gated on the non-spoofable `chrome-extension://` origin (+ `EXTENSION_ID_ALLOWLIST`). No cookie is ever read by the extension.
- **OTP removed:** `handleExchangeRequest`/`/api/connect/extension/exchange` and the popup code-paste UI are gone. `externally_connectable` only matches the app origin (browser-enforced), so the handoff is the sole connect path; if it ever can't reach the extension the page shows an install/retry state.

**UX surface: popup only (no side panel).** The shipped UI is the toolbar **popup** (`entrypoints/popup/main.tsx`). The side panel from the spike sketch was dropped for v1. Background SW + offscreen document still host the SharedWorker + WS exactly as designed.

- **Save flow is "Pattern A" (2026-05-30):** the resting state is a **preview of the current page** — favicon (no-referrer, globe fallback) · title · domain — under a `This page` label, with one primary **"Save this page"** button (auto-focused, so Enter saves in one keypress). A quiet **"Paste a link instead"** toggle reveals a URL input (`← Save this page instead` to go back). Non-savable tabs (`chrome://`, new tab) skip the card and go straight to paste mode; an already-saved page shows a disabled "Already saved" instead of the primary button.
- **Identity row:** the header shows the connected user's avatar (Google image with initials fallback) + first name, a brand link that opens `${APP_URL}/inbox`, and an **inline (non-modal) disconnect confirm** ("Disconnect? · Disconnect · Cancel", Enter/Esc, auto-reverts).
- **Recently saved:** the last 5 links below the save area, each opening in a new tab.

**Effect everywhere.** All non-UI logic is Effect services with per-context layers (`lib/layers.ts`: `BackgroundLayer`/`OffscreenLayer`/`PopupLayer`). Tagged errors in `lib/errors.ts`, branded `ApiKey`/`OrgId` decoded at every boundary (chrome.storage, HTTP responses, WS payload).

**Gotcha — lazy chrome API probes.** `chrome.offscreen` only exists in the service-worker context. The popup imports `lib/layers.ts` → `lib/services/offscreen.ts` transitively, so any **top-level** `chrome.offscreen.*` access crashes the popup before a layer is even selected (`Cannot read properties of undefined (reading 'hasDocument')`). Probe lazily inside the Effect, never at module scope.

**Paywall: REMOVED (2026-05-30) — the extension is FREE.** An earlier iteration (2026-05-29) gated connect + boot on the `integrations` capability (Plus+); that gate was torn out. There is now **no capability check** on the extension connect or sync path — any signed-in workspace can connect and sync. (Raycast + Telegram stay `integrations`-gated; the extension is the exception.)

- The old client paywall (`lib/services/entitlement-client.ts`, `UpgradeScreen`, offscreen `gatedReconcile`) and the `GET /api/connect/extension/entitlement` endpoint are gone.
- `validatePayload`'s extension branch no longer calls `requireCapability` — the sync WS accepts any valid paired-key + allow-listed extension origin.
- The mint endpoint (`POST /api/connect/extension`) no longer requires `integrations`.

**Account info (replaces the entitlement endpoint).** The popup shows the connected user's identity: `GET /api/connect/extension/account` (`Authorization: Bearer <apiKey>`) returns `{ user: { name, image } }` only (no entitlement/tier — name + avatar URL, no email). Client: `lib/services/account-client.ts` (`AccountClient`), which **fails open** (any non-200/error → `null`, header just stays empty) and is fetched async, non-blocking, so the save UI boots immediately. The popup renders the avatar with `referrerPolicy="no-referrer"` (Google's `lh3.googleusercontent.com` 403s on a referer) and an initials fallback; favicons load the same way. No manifest CSP/host-permission change is needed for these images (`img-src` is unrestricted; `host_permissions` only governs fetch/cookies).

**Server endpoints:** `src/cf-worker/connect/extension.ts` — `POST /api/connect/extension` (cookie-authed mint → `{ apiKey, orgId }`, no capability gate) and `GET /api/connect/extension/account` (name + avatar for the popup). `src/cf-worker/sync/auth-payload.ts` (shared payload/metadata decoders), `src/cf-worker/sync/validate-payload.ts` (the single sync-auth path; origin/allow-list gate only, no capability gate). Tests: `connect/__tests__/extension.test.ts`, `sync/__tests__/{auth-payload,validate-payload}.test.ts`.

**Load it:** `bun --filter @cloudstash/extension build:local` → `chrome://extensions` → Load unpacked → `apps/extension/.output/chrome-mv3` (the pinned `key` gives it the fixed ID the app messages). Sign in on the web app, click **Connect** in the popup → it opens `/connect/extension`, which connects automatically. No code to copy.

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

## PoC confirmed (2026-05-28)

End-to-end working on `feat/chrome-extension`. User pasted a connect code, the popup booted Livestore, saved a link from the active tab, and the recent-links query updated reactively. Sync confirmed against local `http://127.0.0.1:3000`.

### What's in `apps/extension/` now

```
apps/extension/
  wxt.config.ts         # popup-only manifest, CSP wasm-unsafe-eval, URL replace plugin
  package.json          # @cloudstash/extension; scripts: dev / build / build:local
  tsconfig.json         # @web/* → ../../src/*; includes entrypoints + lib
  entrypoints/
    background.ts       # ensureOffscreen + chrome.storage proxy
    offscreen/          # createStorePromise host; reboots on creds change
    popup/              # Connect screen + Save form + 5-most-recent + Disconnect
  lib/
    config.ts           # APP_URL / SYNC_URL — placeholders replaced at build time
    livestore.worker.ts        # dedicated worker entry (per-context)
    livestore-shared-worker.ts # cross-context coordinator entry
```

Server side: `src/cf-worker/connect/extension.ts` (mint + exchange), `src/routes/connect/extension.tsx` (code-display page), Origin-gated apiKey-via-payload paths in `src/cf-worker/index.ts` and `src/cf-worker/sync/index.ts`. Exchange now returns `{ apiKey, orgId }` so the popup can use `orgId` as `storeId` without a second round-trip.

### Settled architecture (built and verified)

- Popup is a full Livestore peer client: `<StoreRegistryProvider>` + Suspense + `useStore({ storeId: orgId, syncPayload: { apiKey } })`. `store.useQuery(recentLinks$)` and `store.commit(events.linkCreatedV2(...))` work as in the web app.
- Offscreen document hosts a second `createStorePromise` against the same adapter so sync keeps running between popup opens. SharedWorker coordinates both contexts (same extension origin).
- Workers: cloned thinly from the webapp. URL injected at build time (see below); schema imported from `@web/livestore/schema`.
- Auth: paired API key in WS `payload`, validated by `handleSync` AND `validatePayload` when `Origin: chrome-extension://*`. No cookie path for the extension.

### PoC-specific gotchas worth remembering

1. **MV3 CSP blocks wasm by default.** wa-sqlite refuses to compile under `script-src 'self'`. Add `content_security_policy.extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"` to the manifest.
2. **`chrome.storage` is undefined inside the offscreen document** on the Chrome we tested (despite Chrome docs implying availability). Proxy via the background SW: offscreen sends `chrome.runtime.sendMessage({ type: "cs:get-creds" })`, background reads storage and replies; background also listens to `storage.onChanged` and broadcasts `cs:creds-changed` to offscreen.
3. **Vite `define` does NOT reach the worker bundle in WXT.** Symptom: env table inside the worker shows the right value, but `import.meta.env.WXT_X` references in worker source code get constant-folded to `undefined` and the `||` fallback wins. Fix: a Vite `transform` plugin in `wxt.config.ts` that replaces literal `"__CLOUDSTASH_APP_URL__"` / `"__CLOUDSTASH_SYNC_URL__"` placeholders in `lib/config.ts`. Plugin registered for both `vite.plugins` and `vite.worker.plugins`.
4. **`apps/extension/lib/` lives outside `entrypoints/`** so WXT doesn't try to turn workers into manifest entries. They're imported via `?worker` / `?sharedworker` from popup + offscreen.
5. **OPFS + SharedWorker work fine at `chrome-extension://` origin.** No surprises. Per-origin partition, isolated from the web app.

### Build commands

```bash
bun --filter @cloudstash/extension build:local   # bakes ws://127.0.0.1:3000/sync
bun --filter @cloudstash/extension build         # bakes wss://cloudstash.dev/sync
WXT_APP_URL=https://staging.example.com bun --filter @cloudstash/extension build
```

Load `apps/extension/.output/chrome-mv3` unpacked in `chrome://extensions`. Reload after every build (no HMR — `wxt dev` exists but we're staying on manual reload).

## PoC → working extension (next session)

Order of work, smallest verifiable increments first.

1. **UI polish.** Tailwind 4 in the popup (already wired in the webapp; the extension currently uses inline styles). Reuse `@/components/ui/*` where feasible (button, card). Bring in Lucide icons. Match the webapp's visual language.
2. **Sync status indicator.** Use `useSyncStatus()` from `@livestore/react` in the popup; tiny dot in the footer next to the user identity. Mirror the webapp's `useSyncStatusStore` semantics.
3. **Connected-as identity row.** Currently the popup just says "Disconnect". Surface the user's email / org name. Either (a) extend the exchange response to include `{ userEmail, orgName }`, or (b) add `GET /api/connect/extension/whoami` that the popup calls once and caches. (a) is cheaper; (b) is more general.
4. **Disconnect should revoke.** Today Disconnect only clears `chrome.storage.local`. Add `DELETE /api/connect/extension` (cookie-authed from the popup itself? — won't have cookies, so use the apiKey to authenticate the revoke). Server deletes the row by id. Then clear storage.
5. **Auto-paste connect code.** When the user generates a code on `/connect/extension` and the extension is installed, the page can postMessage to the extension via `chrome.runtime.sendMessage(extensionId, ...)` if we expose it via `externally_connectable` in the manifest. Removes the manual copy step. Optional polish.
6. **Already-saved badge.** Reuse `linkByUrl$` from `src/livestore/queries/links.ts`. If pre-filled URL matches an existing link, show "Already saved" inline instead of treating it as a generic error.
7. **Keyboard shortcut.** `commands` in the manifest with default `Alt+Shift+S` (TBD) to open the popup. `chrome.commands.onCommand` in background.
8. **Right-click context menu.** "Save link to Cloudstash" on link/page context. `chrome.contextMenus` API. Posts a save event via the same store path used by the popup — but the offscreen doc needs to be the one committing, since the popup isn't open. Two options:
   - Background SW → `chrome.runtime.sendMessage` to offscreen → offscreen `store.commit(...)` directly (offscreen already holds a store).
   - Background SW → `chrome.runtime.sendMessage` to offscreen → offscreen exposes a "save URL" RPC.
     Either way the offscreen store is the actor.
9. **Telemetry / errors.** Surface push/sync errors back to the user; today they're console-only. Use the same `useSyncStatus` value to drive a banner state.
10. **Production deployment story.** `WXT_APP_URL` baked into the prod artifact; CWS submission (extension ID stability matters because the connect endpoint will eventually want to gate on `chrome-extension://<known-id>/`).

### Out of scope (still)

- Content scripts / hover affordance on saved links in pages — phase 3.
- Firefox build via `wxt build:firefox` — phase 3, validate after Chrome ships.
- A "browse links" side panel UI — explicitly skipped for v1; revisit only if the popup gets cramped.

### Decisions to make at the start of next session

- **Tailwind in popup?** YES (likely) — pulls in webapp tokens for free. Watch bundle size; current popup chunk is 206 kB pre-tailwind.
- **Whoami endpoint vs. exchange-payload extension?** Default to extending the exchange response. Skip the round-trip.
- **Disconnect = revoke vs. local-only?** Revoke. Currently dangling API keys accumulate.

## v1 popup plan (next — 2026-05-27)

Pivoting v1 from "side panel as browse-y UX" to **popup as quick-save action**, modeled after Raycast: one input + 5 most-recent context strip + connect/login state. Browsing UI is not in v1.

### UX surface

Single popup, no side panel. Sized ~360px wide, content-height.

```
┌─ Cloudstash ────────────────┐
│ ┌──────────────────────┐    │ ← URL input, pre-filled with active tab URL
│ │ https://current...   │    │   (chrome.tabs.query({active, currentWindow}))
│ └──────────────────────┘    │
│ [ Save ]                    │ ← commits v1.LinkCreated to local store
│                             │
│ Recent                      │
│  • Some Title               │ ← 5 most-recent from local store
│  • Another Title            │   (reactive query, updates live)
│  • …                        │
│                             │
│ ─────────────────           │
│ Connected as user@x  (Disc) │ ← status row; if not connected, swap for
└─────────────────────────────┘   "Connect" CTA → opens /connect/extension
```

Save flow on submit: validate URL → `store.commit(events.linkCreated({ id, url, domain, createdAt }))` → close popup. No optimistic UI needed — the commit is local-first and the popup closes immediately.

### Architecture (refines the doc above)

```
background.ts (MV3 service worker)
  • toolbar click → opens popup (default_popup in manifest)
  • on extension startup → ensureOffscreen()  ← otherwise sync only runs while popup is open
  • cannot host store (no SharedWorker in service workers)

offscreen.html (chrome.offscreen, reasons: ['WORKERS'])
  • Hosts:
    - LiveStoreSharedWorker (cross-context coordinator)
    - LiveStoreWorker (per-context dedicated worker — one for offscreen itself)
    - WS to /sync via makeWsSync({ payload: { apiKey } })
  • Stays open indefinitely — keeps sync alive between popup opens
  • Reads apiKey + appUrl from chrome.storage.local at boot, restarts store
    when they change

popup.html (chrome.action default_popup)
  • Short-lived: spawns on toolbar click, dies on click-outside
  • Connects to the SAME SharedWorker as offscreen (same origin)
  • Runs its own LiveStoreWorker (per-tab/popup) — peer client, not host
  • React app uses useStore({ schema, adapter, storeId: orgId })
  • storeId comes from the apiKey's metadata.orgId — extension must learn this
    at connect time and persist alongside the key (chrome.storage.local: { apiKey, orgId, appUrl })
```

### Lessons from the spike that apply directly

- **Auth via paired API key in WS `payload`.** Already implemented end-to-end:
  - `POST /api/connect/extension` mints key + 60s code (cookie-authed from app)
  - `POST /api/connect/extension/exchange` returns `{ apiKey }`
  - Worker `handleSync` AND sync-cf `validatePayload` both accept `payload.apiKey`
    when `Origin: chrome-extension://*`
- **sync-cf URL requires `transport=ws`** — `makeWsSync` already sets this; only
  hand-rolled WS opens need to remember.
- **Origin gate** is the only authz check — browser sets it, non-spoofable from regular pages.
- **chrome.cookies is not exposed in offscreen** — irrelevant now (we don't read cookies).
- **`@web/*` alias** in extension `tsconfig.json` maps to `../../src/*` — already configured. Vite (WXT) resolves this at build time. Verify schema imports survive a build.
- **WXT auto-imports** (`defineBackground`) work at build but need `.wxt/wxt.d.ts` in `include` for `tsc --noEmit` to find them.

### What's in `apps/extension/` today (spike state — keep most of it)

- `wxt.config.ts` — keep `host_permissions`, remove `sidePanel` + `side_panel`, add `default_popup`
- `entrypoints/background.ts` — keep + add `chrome.runtime.onInstalled` and `onStartup` to call `ensureOffscreen()`
- `entrypoints/offscreen/{index.html,main.ts}` — replace WS-spike body with real `createStorePromise` setup
- `entrypoints/sidepanel/*` — **delete** (or rename to `popup/` and rewrite)
- `entrypoints/popup/{index.html,main.tsx}` — **new**, this is v1 UI
- `public/sw.js` — **delete** (spike-only stub; the real SharedWorker comes from `@livestore/adapter-web/shared-worker`)
- Add: thin `@web/livestore/extension-shared-worker.ts` and `@web/livestore/extension.worker.ts` analogues — extension can't reuse the main app's worker files directly because the WS URL is now from `chrome.storage.local`, not `globalThis.location.origin`. Two clean paths:
  - **(preferred)** parameterize `src/livestore.worker.ts` to read URL/payload from a `postMessage` config call, OR
  - duplicate the worker into `apps/extension/entrypoints/livestore.worker.ts` and import schema via `@web/livestore/schema`. Simpler, ~10 lines.

### Files to add/modify (estimate)

| File                                                                    | Action  | Notes                                                                                                                         |
| ----------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `apps/extension/wxt.config.ts`                                          | edit    | swap sidePanel → action.default_popup; drop sidePanel/cookies perms                                                           |
| `apps/extension/entrypoints/background.ts`                              | edit    | ensureOffscreen on startup + onInstalled, not just on message                                                                 |
| `apps/extension/entrypoints/popup/index.html`                           | add     | popup shell                                                                                                                   |
| `apps/extension/entrypoints/popup/main.tsx`                             | add     | React app, calls useStore, save form, 5-recent list, connect state                                                            |
| `apps/extension/entrypoints/offscreen/main.ts`                          | rewrite | real Livestore client init (createStorePromise), reads apiKey/orgId/appUrl from storage, opens WS via makeWsSync with payload |
| `apps/extension/entrypoints/livestore.worker.ts`                        | add     | thin clone of `src/livestore.worker.ts`, dynamic URL/payload                                                                  |
| `apps/extension/entrypoints/livestore-shared-worker.ts`                 | add     | thin re-import (same Vite workaround as `src/livestore-shared-worker.ts`)                                                     |
| `apps/extension/entrypoints/sidepanel/*`, `apps/extension/public/sw.js` | delete  | spike scaffolding                                                                                                             |

### Phasing

1. **Stub popup with manifest swap.** Confirm chrome.action popup opens, can read `chrome.tabs.query`. Connect UI + paste flow lifts straight from current side panel.
2. **Real offscreen Livestore client.** Read `{ apiKey, orgId, appUrl }` from `chrome.storage.local`; `createStorePromise({ schema, adapter, storeId: orgId })`; verify it syncs the eventlog (check D1 / worker logs).
3. **Popup as peer client.** `useStore(...)` in React, query 5 most recent links, render. Verify the query reacts to events synced from the web app.
4. **Save flow.** Pre-fill with active tab URL; on submit, `store.commit(events.linkCreated({...}))`; close popup. Verify the event reaches the worker and the web app sees it.
5. **Store orgId at connect time.** Currently the connect/exchange returns only `{ apiKey }`. Either:
   - Add `orgId` to the exchange response (cleaner — server already has it from `metadata.orgId`)
   - Or have the extension fetch its own `metadata.orgId` from a new `GET /api/connect/extension/whoami` endpoint
     The exchange-response change is simpler.

### Open questions for implementation time

- **Does `makePersistedAdapter` work at `chrome-extension://` origin without modification?** Plan says yes (OPFS works there, SharedWorker proven, no Vite issues seen so far). First risk to verify in phase 2.
- **Does `chrome.action` popup tolerate being a Livestore client?** Popup dies on click-outside. Livestore tabs leaving is normal — store session unmounts cleanly. SharedWorker keeps state across popups. Verify queries reattach instantly on second open.
- **OPFS for chrome-extension origin** — already noted, just add `unlimitedStorage` permission (we have it).
- **Do we delete the old API key on disconnect?** Currently `Disconnect` only removes from `chrome.storage.local` — the API key row stays in D1 forever. Should call a new `DELETE /api/connect/extension/:keyId` endpoint, or just rely on user revoking via app settings (when we add that UI).
- **What's the active-tab URL extraction permission cost?** `chrome.tabs.query({ active: true, currentWindow: true })` needs the `tabs` permission (already have it) — but only returns the URL if we have host permission for that URL, OR `activeTab` permission. For "save any page" we want `activeTab` (no permission warning at install, granted when user clicks the extension icon).

### Decision deferred

- Whether to keep a side panel surface in parallel with the popup (for power users / pinned browse view). Out of v1. If we add later, both share the same SharedWorker — no extra infra.

## Auth decision (2026-05-27)

After the spike (see below), auth via inherited cookies turned out to be unworkable in practice:

- WS handshakes from `chrome-extension://` origin don't carry cookies (crbug 947413), so the WS upgrade is rejected with `SESSION_EXPIRED` before reaching the DO.
- Even falling back to `chrome.cookies.getAll` via the background SW + WS `payload` works only when the extension is loaded in the _same Chrome profile_ as the signed-in tab. Profile cookie isolation makes this fragile (the everyday case of "loaded extension in profile A, signed in on profile B" silently fails).
- The Better Auth browser-extension guide suggests an in-extension sign-in via `createAuthClient`, but the guide doesn't address WebSocket sync and the OAuth-in-extension flow (`chrome.identity.launchWebAuthFlow`) is heavyweight.

**Settled approach: paired API key, mirroring the Raycast pattern** (`src/cf-worker/connect/raycast.ts`).

- `POST /api/connect/extension` (cookie-authed from the app) → mints a `@better-auth/api-key` row tagged `{ orgId, source: "chrome-extension" }`, returns a 60-second one-shot code.
- `POST /api/connect/extension/exchange` (no auth, just the code) → returns `{ apiKey }`.
- App route `/connect/extension` displays the code; user pastes it into the extension side panel.
- Extension stores the key in `chrome.storage.local` and forwards it via the sync-cf `payload` query param on the WS URL.
- `handleSync` (`src/cf-worker/index.ts`) reads `payload.apiKey` only when `Origin` starts with `chrome-extension://` (Origin is browser-controlled, non-spoofable), verifies via `auth.api.verifyApiKey`, then checks that the key's `metadata.orgId` matches `storeId`.

Side effects of this decision:

- Extension user can be different from app user (e.g. shared computer) — just go through `/connect/extension` again.
- Tokens are long-lived and revocable from API-key settings (whenever we surface that UI).
- No Better Auth `trustedOrigins` change needed — the extension never calls `/api/auth/*`, only the connect endpoints + WS.
- "First-run sign-in" UX in the extension is "Click Connect → app opens → paste code back". One extra step vs. cookie inherit, but works regardless of profile setup.

## Spike results (2026-05-27)

Ran the spike scaffold against local dev (`ws://localhost:3000/sync`):

- **Experiment 2 (SharedWorker shared between side panel + offscreen):** ✅ PASS. Port count = 2, both contexts attach to one SharedWorker instance via `new SharedWorker(chrome.runtime.getURL("sw.js"))`. The side-panel hook initially sees count = 1 (only its own port) before the offscreen doc connects — render after `spike:open-ws` returns to see 2.
- **Experiment 1 (cookie on WS handshake):** ❌ FAIL. Server log:
  ```
  Sync.spike.handshake { origin: "chrome-extension://...", cookiePresent: false, cookieNames: [] }
  Sync auth rejected { code: "SESSION_EXPIRED", status: 401 }
  ```
  Cookies are **not** attached to WS handshakes from `chrome-extension://` origin even with `host_permissions: ["http://localhost:3000/*"]`. Confirms crbug 947413 — `host_permissions` covers HTTP requests but not the WS upgrade.

**Decision:** switch to the pre-designed fallback — `chrome.cookies.get({ url, name })` in the offscreen doc to read the better-auth session cookie (HttpOnly is accessible to extensions with host permission), encode it into the WS `payload` query param, parse server-side in `validatePayload`. ~5 lines of client code, ~5 lines of server code. No architectural change.

Also worth noting from the spike: sync-cf's `SearchParamsSchema` requires `transport=ws` in addition to `storeId`. The spike forgot it on first run; second run added it and the handshake reached `checkSyncAuth`.

## How to run the spike (scaffolded in `apps/extension/`)

The spike scaffold answers both open questions (WS+cookie, SharedWorker-in-side-panel) without committing to any further architecture.

1. **Install + build.** From repo root:
   ```bash
   bun install
   bun --filter @cloudstash/extension build
   ```
2. **Load unpacked.** In Chrome: `chrome://extensions` → enable Developer mode → "Load unpacked" → `apps/extension/.output/chrome-mv3`. Note the extension id — it's the chrome-extension origin.
3. **Sign in** to `https://app.cloudstash.io` (or `http://localhost:3000` if testing against local; both are in `host_permissions`). Grab your active `orgId` from devtools / the URL.
4. **Open the side panel.** Click the extension's toolbar icon. The side panel reports the SharedWorker port count as it sees it.
5. **Run spike.** Paste the `orgId` into the side panel, optionally tweak the sync URL (defaults to prod), click "Run spike". The offscreen doc opens a WebSocket to `/sync?storeId=<orgId>` with no payload (forces server to rely on cookie).
6. **Read results.**
   - **Experiment 2 (SharedWorker):** side panel shows port count. ≥ 2 → side panel and offscreen share one instance → pass.
   - **Experiment 1 (WS+cookie):** check Cloudflare worker logs (or local `wrangler dev`) for the `Sync.spike.handshake` info log added in `src/cf-worker/sync/index.ts`. It carries `origin` and `cookiePresent`. If `cookiePresent: true` _and_ the WS opens → pass. If `cookiePresent: false` or the WS closes with auth error → cookies don't ride the WS handshake from `chrome-extension://` origin, fall back to the `payload`-param plan in [[chrome-extension#Triggers to revisit]].

The spike scaffold (`apps/extension/`) and the server-side log are intentionally throwaway — once both experiments pass, rip out the log and replace the spike entrypoints with the real Livestore client setup.

## Out of scope for v1

- Content scripts ("already saved" badges, hover affordances) — defer to v2 once core save flow ships.
- Firefox build — WXT supports it but the Cloudflare-side cookie behavior may differ; ship Chrome first.
- Cross-device sync of extension-specific settings — use `chrome.storage.sync` if needed; doesn't go through Livestore.
