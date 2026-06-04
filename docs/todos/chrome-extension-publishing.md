# Chrome Extension Publishing Checklist

The Chrome Web Store submission flow is gated on a number of policy items, asset requirements, and store-listing fields. This checklist walks each one.

Companion to [[chrome-extension]] (architecture + roadmap).

Final store-listing text (tagline, description, single-purpose, justifications, privacy answers) is drafted paste-ready in [[chrome-extension-listing-copy]].

> **Status (2026-05-30):** the extension is **FREE** (no paywall). Everything that can be pre-decided below has been filled in. What remains is the manual dashboard work in the next section.

## Manual steps for you (cannot be automated)

These require your hands/account and can't be done from the repo. Do them in order:

- [ ] **Capture 3 screenshots at 1280×800** (PNG): (1) popup connect screen, (2) popup save flow showing recent links with favicons + your avatar in the identity row, (3) the `/connect/extension` page on the web app. Save under `apps/extension/store-assets/`.
- [ ] **Pay the one-time $5 Chrome Web Store developer fee** (if not already paid) at the [developer dashboard](https://chrome.google.com/webstore/devconsole).
- [ ] **Bump version + build the zip**: `cd apps/extension && bun run zip` → upload the resulting `.output/*.zip` via the dashboard.
- [ ] **Paste the listing fields** (description, tagline, single-purpose, permission justifications) from [[chrome-extension-listing-copy]] and the **Privacy Practices answers** from §4 below.
- [ ] **Set category = Productivity → Tools, language = English** (§5).
- [ ] **Set visibility to _Unlisted_** for the soft launch, then flip to _Public_ after a few days.
- [ ] **Submit for review.**
- [ ] **After the first upload, verify the CWS-assigned extension ID matches the pinned `eelfhpgegemfgccaakcmfgldcaojadfj`.** Because we ship a committed manifest `key`, it should stay stable. If it differs, set `WXT_EXTENSION_PUBLIC_KEY` + `VITE_EXTENSION_ID` and the `EXTENSION_ID_ALLOWLIST` worker var to the new ID (else the session handoff + sync allow-list break). See §7 and [[reference_chrome_ext_ws_cookies]].

## 1. Identity & versioning

- [x] **Name**: `Cloudstash` (locked in `wxt.config.ts`)
- [x] **Tagline**: in [[chrome-extension-listing-copy]].
- [x] **Version**: `0.1.0` set in `apps/extension/package.json` → manifest. Bump before each re-upload.
- [x] **Author**: `"author": "Bohdan Ptyts"` in `apps/extension/package.json`.
- [x] **`homepage_url`**: `https://cloudstash.dev` added to `wxt.config.ts` manifest.
- [x] **Single-purpose declaration**: locked in [[chrome-extension-listing-copy]].

## 2. Icons

Required sizes (PNG, square):

- [x] 16×16 — toolbar
- [x] 32×32 — Windows tray
- [x] 48×48 — extensions page
- [x] 128×128 — Web Store + install dialog

Done — generated in `apps/extension/public/icon/{16,32,48,128}.png`; WXT auto-wires them into the manifest `icons` field (confirmed in the built manifest).

Notes:

- Source is the **torus-knot mark** (`CloudstashLogo`), **not** `src/logo.svg` (that's the React atom). Rendered as the branded squircle tile: Midnight gradient `#0a0f2c`→`#2d5fb8`, white knot. The generator is canvas-based (`/tmp/icon-gen.html`, headless Chrome → `toDataURL`); re-run if the mark changes.
- The 16×16 is necessarily chunky (knot detail muddies at that size); 32/48/128 are crisp.
- The Web Store also wants a **440×280 small tile** and a **1400×560 marquee** for the listing. ✓ **Created** — generated from the `/brand` page (Chrome Web Store section, admin-only) and saved under `apps/extension/store-assets/` (`cloudstash-cws-440x280.png`, `cloudstash-cws-1400x560.png`, plus a `1280x800` branded filler). The old 920×680 large-tile slot is deprecated; 1400×560 is the current marquee spec.

## 3. Permissions justification

Chrome Web Store now requires written rationale for each permission and host permission. Draft these now to avoid review rejections.

| Permission               | Justification (≤1000 chars)                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `offscreen`              | Required to host the Livestore SharedWorker and the WebSocket sync connection while the popup is closed. No DOM access; workers-only reason. |
| `storage`                | Stores the paired API key and orgId locally so the user only authenticates once.                                                             |
| `unlimitedStorage`       | Livestore's local SQLite mirror (OPFS) can grow beyond the default 5MB quota when the user has many saved links.                             |
| `tabs`                   | Reads the active tab's URL to pre-fill the save form. Does not access tab contents.                                                          |
| host: `cloudstash.dev/*` | The extension's only network destination. Used for the auth-paired connect flow and Livestore WebSocket sync.                                |

- [x] Final wording locked in [[chrome-extension-listing-copy]] (paste verbatim into the listing form).

## 4. Privacy disclosures

Web Store collects a separate **Privacy Practices** form. Answers below are paste-ready — fill them into the dashboard form (this is one of the manual steps above).

- [x] **Single purpose** (paste): `Cloudstash lets you save the current page to your Cloudstash account and view your recently saved links, syncing them with the Cloudstash web app.`
- [x] **Data collected** — tick these categories in the form:
  - _Authentication information_ — the paired API key that links the extension to your account.
  - _Web history_ — only the URLs you explicitly choose to save.
  - _Personally identifiable information_ — your account display name and Google profile avatar, fetched only to show who you are connected as.
- [x] **Why each is collected / how it's used** (paste): `The paired API key authenticates the extension with the user's Cloudstash account. URLs are collected only when the user explicitly chooses to save a page. The user's display name and Google avatar are loaded to show which account the extension is connected as, and favicon images for saved sites are loaded to render the recent-links list. No data is used for any purpose beyond providing the save-and-sync feature.`
- [x] **Image loading note**: the popup loads remote images — the user's **Google profile avatar** (identity row) and **per-site favicons** for saved links. These are display-only and must be disclosed.
- [x] **Not sold / not shared with third parties for ads** — confirm "I do not sell or transfer user data to third parties, outside of the approved use cases."
- [x] **Limited use** — confirm "I do not use or transfer user data for purposes unrelated to my item's single purpose."
- [x] **Encryption in transit**: yes — sync runs over WSS, REST over HTTPS. Tick the "data is encrypted in transit" certification.
- [x] **User can request deletion**: yes — via Cloudstash account settings (`/settings/account`).
- [x] **Privacy policy URL**: `https://cloudstash.dev/privacy` (route is `/privacy`, not `/legal/privacy`). The page exists and has a dedicated `#browser-extension` section covering the extension's data handling — link `https://cloudstash.dev/privacy#browser-extension` if you want to deep-link it.

## 5. Store listing assets

- [ ] **Description (≤16,384 chars)**: lead paragraph + bullet list + screenshots in copy. Draft in `docs/todos/chrome-extension-listing-copy.md`.
- [ ] **At least one screenshot** at **1280×800** (max 5) — UX is final, capture now (manual step above):
  - [ ] Screenshot 1: popup connect screen
  - [ ] Screenshot 2: popup save flow with recent links (favicons + avatar in identity row)
  - [ ] Screenshot 3: connect page on the web app
- [x] **Promotional images**: 440×280 small tile + 1400×560 marquee — generated from `/brand`, saved in `apps/extension/store-assets/`.
- [x] **Category**: Productivity → Tools. _(decided)_
- [x] **Language**: English. _(decided)_

## 6. Code review for submission

Run these once before submitting and again after any meaningful change:

- [x] `bun run check` — lint + format + Effect diagnostics. (clean as of 2026-05-29)
- [x] `cd apps/extension && bun run compile` — type check. (clean)
- [x] Inspect `apps/extension/.output/chrome-mv3/manifest.json`:
  - No leftover dev URLs. ✓
  - Permissions match the justification table. ✓
  - `content_security_policy.extension_pages` is `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`. ✓
- [x] Grep the prod `.output/` bundle for `127.0.0.1` / `localhost:3000` / `WXT_APP_URL` — empty. Sync URL bakes to `wss://cloudstash.dev/sync`.
- [x] `host_permissions` excludes `localhost`/`127.0.0.1` in the prod build. `wxt.config.ts` now derives host perms from `WXT_APP_URL`: prod (default) → `cloudstash.dev` only; `bun run build:local` → localhost.

Re-run this whole section before each submission (the checks above reflect the 2026-05-29 state).

## 7. Extension ID stability

The ID is now **load-bearing**: the web app messages the extension by ID for the session handoff (`externally_connectable`), and the sync gate allow-lists it. So the ID is pinned to a key we control, not left to Chrome.

- [x] `wxt.config.ts` sets `key` to a committed public key (private key in `apps/extension/.keys/`, gitignored) **for local/dev builds only** — pinning the unpacked dev ID to **`eelfhpgegemfgccaakcmfgldcaojadfj`**. ⚠️ The CWS **rejects** a `key` field on upload ("key field is not allowed in manifest"), so `key` is omitted from store builds (gated on `IS_LOCAL_BUILD`); the **published** ID is assigned by Google and will differ from the local one.
- [x] App knows the ID via `src/lib/extension-connect.ts` (`EXTENSION_ID`, `VITE_EXTENSION_ID`-overridable).
- [x] `externally_connectable.matches` = the app origin(s) — prod `cloudstash.dev`, local `localhost`/`127.0.0.1` (browser-enforced sender gate).
- [x] Sync gate reads `EXTENSION_ID_ALLOWLIST` via `parseExtensionAllowlist`. Empty = allow any extension origin (dev); non-empty = only those IDs, else `ForbiddenExtensionOriginError` → 403.
- [ ] **On publish:** if the CWS-assigned ID differs from the pinned one, update `DEV_EXTENSION_KEY`/`EXTENSION_ID` defaults (or set `WXT_EXTENSION_PUBLIC_KEY` + `VITE_EXTENSION_ID`) and the `EXTENSION_ID_ALLOWLIST` worker var. Because we ship `key`, the ID should stay stable — verify after the first upload. Reference: [[reference_chrome_ext_ws_cookies]].

## 8. Functional testing matrix

- [x] **Chrome stable** — golden path: connect (auto handoff), save current tab, see in recent + sync. Confirmed 2026-05-29.
- [x] **Chrome stable** — extension is FREE (2026-05-30): no paywall; any signed-in workspace connects + saves. (The earlier free-plan Upgrade screen was removed.)
- [ ] **Chrome stable** — disconnect, then reconnect (re-runs the handoff).
- [ ] **Brave / Edge / Arc / Opera** (Chromium variants) — install unpacked, repeat golden path.
- [ ] **Offline** — extension surfaces a clear error rather than hanging.
- [ ] **Logged out of the web app** — connect page redirects to login, then back.
- [ ] **Service worker lifecycle** — wake from idle (close browser ~5 min, reopen popup); offscreen should rehydrate.
- [ ] **OPFS persistence** — save a link, close popup, reopen. Recent list still populated.
- [ ] **Multiple profiles** — install in a second Chrome profile; cred storage should be isolated.

## 9. Pre-submission build

- [ ] Bump `apps/extension/package.json` version.
- [ ] `cd apps/extension && bun run zip` — produces a Web-Store-ready zip in `.output/`.
- [ ] Test the zip by drag-installing it as **packed** into a clean Chrome profile.
- [ ] Save the zip alongside a tag in git (`extension-v0.1.0`).

## 10. Submission

- [ ] Web Store one-time **$5 developer fee** if not already paid.
- [ ] Upload zip via the [developer dashboard](https://chrome.google.com/webstore/devconsole).
- [ ] Fill all fields from sections 1–5 above.
- [ ] Set **visibility**: start with _Unlisted_ for a soft launch, switch to _Public_ after a few days.
- [ ] Submit for review. Typical review time: 1–3 business days; can stretch to 2 weeks for first-time submissions.

## 11. Automated publishing (CI)

A manual-dispatch workflow exists at `.github/workflows/publish-extension.yml` — it bumps nothing, builds + zips, uploads the zip as an artifact, and (unless `dry_run`) runs `wxt submit --chrome-zip` to push to the Chrome Web Store. It's dormant until the secrets below are set; run it from the Actions tab. Bump `apps/extension/package.json` in the PR first (the Web Store rejects a duplicate version).

**One-time setup (≈1 hr, mostly Google Cloud clicking):**

1. Google Cloud project → enable the **Chrome Web Store API**.
2. Configure the **OAuth consent screen** and **publish it to "In production"**. If left in "Testing", the refresh token expires after **7 days** — this is the trap that silently breaks CI publishing.
3. Create an OAuth **Desktop** client → run `cd apps/extension && bunx wxt submit init` once to mint a refresh token (writes a local `.env.submit`, gitignored).
4. Add four repo secrets (Settings → Secrets → Actions):
   - `CHROME_EXTENSION_ID` = `bdommhffamndfanbpnikgmpjncpcobia`
   - `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`

**Caveats:** first publish must be manual (the API only *updates* an existing listing — done); `submit` only uploads + submits for review, it can't skip Google's queue; the same four secrets/`wxt submit` flags extend to Edge/Firefox when those land.

## 12. Post-launch

- [x] Link the extension from the in-app integrations panel — `ExtensionCard` added to `integrations-section.tsx` (mirrors the Raycast card). Web Store URL is live: `CHROME_WEB_STORE_URL` in `src/lib/extension-connect.ts` (shared, points at the published listing).
- [ ] Announce on the landing page + add an "Install for Chrome" CTA.
- [ ] Set up Web Store analytics review cadence (weekly for first month).
- [ ] Decide whether to mirror to **Microsoft Edge Add-ons** and **Firefox AMO** (manifest is MV3-compatible across all three, may need minor `browser_specific_settings`).

## 12. Cross-browser portability

**The architecture is already well-isolated.** Every platform API call is confined to `lib/services/*` + `entrypoints/background.ts`, behind Effect service tags (`Tabs`, `CredsStorage`, `Offscreen`, `Messenger`, `ConnectClient`). The popup UI and business logic are browser-agnostic, so porting means swapping service implementations per target, not rewriting features. There are exactly **two hard blockers**, both Firefox/Safari-specific:

| API in use                                              | Where                                            | Chromium (Edge/Brave/Opera/Arc/Vivaldi) | Firefox                 | Safari |
| ------------------------------------------------------- | ------------------------------------------------ | --------------------------------------- | ----------------------- | ------ |
| `chrome.offscreen`                                      | `lib/services/offscreen.ts`, `livestore-host.ts` | ✅ supported                            | ❌ **no offscreen API** | ❌     |
| `externally_connectable` / `onMessageExternal`          | `background.ts`, web `extension-connect.ts`      | ✅ supported                            | ❌ **not implemented**  | ❌     |
| `tabs.query`, `storage.local`, `windows.*`, `runtime.*` | services + background                            | ✅                                      | ✅ (via `browser.*`)    | ✅     |

### Chromium family — works **as-is, ~zero code change**

The existing `chrome-mv3` build loads unmodified in Edge, Brave, Opera, Arc, Vivaldi. They share the offscreen + `externally_connectable` runtime. Because we ship a committed manifest `key`, the extension ID stays `eelfhpgegemfgccaakcmfgldcaojadfj` across all of them, so the session handoff + sync allow-list keep working. `externally_connectable.matches` gates on the **web app origin** (`cloudstash.dev`), not the browser, so nothing there changes. Work = test the golden path (§8 already lists Brave/Edge/Arc/Opera) + ship the same zip to the **Edge Add-ons** store.

### Firefox — medium effort, two architectural changes

1. **Replace offscreen.** Firefox MV3 background runs as a persistent/event page that can host the Livestore SharedWorker + WS + WASM directly. Need a Firefox host path that runs `LivestoreHost` in the background page instead of an offscreen document (gate on WXT's `import.meta.env.BROWSER`).
2. **Replace `externally_connectable`.** The web→extension handoff must go through a content script injected on the app origin that bridges `window.postMessage` ↔ `runtime.sendMessage`.
3. **Namespace swap** `chrome.*` → WXT's unified `browser.*` (webextension-polyfill) — necessary but not sufficient on its own.

### Safari — largest lift, defer

Needs the Xcode WebExtension converter + an Apple Developer account, and also lacks both blocker APIs. Out of scope for now.

> WXT can already emit per-target builds (`wxt build -b firefox`/`-b edge`, `wxt zip -b …`) — the build tooling is not the blocker; the two Chromium-only APIs are.

## Open questions

- ~~**Auto-paste connect code**~~ — **done (2026-05-29).** Shipped the `externally_connectable` session handoff; the manual code/paste UX and `/exchange` endpoint were removed. The app pings + pushes the key to the extension by ID. See [[chrome-extension]] "Shipped".
- **Right-click context menu**: requires the `contextMenus` permission — adds one more justification entry. Land in v0.2 or skip.
- **Keyboard shortcut**: `commands` is a free permission upgrade. Land in v0.1.
