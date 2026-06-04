# Chrome extension

One-click save from the browser toolbar. A peer **Livestore client** (not an HTTP ingest wrapper) — every feature is a `store.commit`, no new endpoint per feature. Lives in `apps/extension` (WXT). Shipped + published, FREE (no capability gate).

Publishing: [[chrome-extension-publishing]]. Listing copy: [[chrome-extension-listing-copy]].

## Non-obvious technical decisions

- **Livestore-as-client, not HTTP ingest.** Raycast uses `POST /api/ingest` because it can't run a browser Livestore client; Chrome can, so the extension is a full peer (save/tag/edit/"already saved" are all local commits). The cost is it must share the web app's schema — hence the bun-workspace setup below, not a separate repo like Raycast.

- **Offscreen document hosts the SharedWorker + WS.** MV3 service workers can't spawn a SharedWorker (whatwg/html#8362), so `background.ts` ensures an offscreen doc (`reasons: ['WORKERS']`) that hosts the Livestore SharedWorker + `/sync` WebSocket. Offscreen docs persist indefinitely (only `AUDIO_PLAYBACK` auto-times-out), keeping sync alive between popup opens. The popup is just another SharedWorker client and dies on click-outside. (Popup-only; the spike's side panel was dropped.)
  - Gotcha: `chrome.offscreen` only exists in the SW context, but the popup imports the layer graph transitively — any **top-level** `chrome.offscreen.*` access crashes the popup. Probe lazily inside the Effect, never at module scope.

- **Separate origin.** `chrome-extension://<id>` is its own origin → own OPFS + SharedWorker, isolated from the web app; sync still converges through `SyncBackendDO`. DevTools/OPFS Explorer can't inspect extension OPFS (debugging is painful); `unlimitedStorage` reduces eviction.

- **Auth = paired API key in the WS `payload`, auto-handed-off.** Cookies do NOT ride the WS handshake from a `chrome-extension://` origin (crbug 947413), and the `chrome.cookies` fallback is profile-fragile — so we use a Raycast-style paired key. `/connect/extension` mints the key and **pushes it to the extension by ID** via `externally_connectable` (matches the app origin only, browser-enforced — no OTP codes). The server validates on the **non-spoofable `chrome-extension://` Origin** + `EXTENSION_ID_ALLOWLIST`, single path `src/cf-worker/sync/validate-payload.ts`. sync-cf also requires `transport=ws` in the URL.

- **Stable extension ID.** A committed manifest `key` pins the dev/unpacked ID (`eelfhpgegemfgccaakcmfgldcaojadfj`); the Web Store assigns the published ID (`bdommhffamndfanbpnikgmpjncpcobia`). Prod targets the published one; the handoff + sync allow-list gate on it. If the published ID ever changes, update `VITE_EXTENSION_ID` + the `EXTENSION_ID_ALLOWLIST` worker var.

- **FREE — no capability gate** on connect or sync (any signed-in workspace). Raycast + Telegram stay `integrations`-gated; the extension is the exception.

- **Disconnect = remote revoke + auto-logout.** Popup Disconnect calls `DELETE /api/connect/extension` (apiKey-authed) to delete the paired key, then clears local creds regardless. `AccountClient` treats a `/account` 401 as a logout signal, so a key revoked from the web app logs the extension out on its next popup open. Caveat: sync auth runs **only at the WS handshake**, so an already-open socket keeps syncing until its next reconnect — accepted as low-stakes.

- **Schema sharing via bun workspace** (not a full monorepo). The extension imports `@web/livestore/schema` through a tsconfig alias; changes auto-propagate on rebuild, no versioning. Extract `packages/livestore-shared/` only when a third client (mobile/electron) lands.

- **Remote images** (Google avatar, site favicons) load with `referrerPolicy="no-referrer"` — `lh3.googleusercontent.com` 403s on a referer. No manifest CSP/host-permission change needed (`img-src` is unrestricted).

## Revisit triggers / out of scope

- Content scripts ("already saved" badge, hover affordances) — deferred.
- Firefox/Safari — need an offscreen→background-page swap + an `externally_connectable`→content-script bridge; see the cross-browser section in [[chrome-extension-publishing]].
- A lighter upstream Livestore adapter (no SharedWorker requirement) would let us drop the offscreen-doc pattern.
