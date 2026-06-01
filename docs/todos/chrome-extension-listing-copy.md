# Chrome Web Store — Listing Copy

Paste-ready text for the [developer dashboard](https://chrome.google.com/webstore/devconsole) listing form.
Companion to [[chrome-extension-publishing]] (process) and [[chrome-extension]] (architecture).

Keep this in sync with the shipped extension: popup UI, paired-API-key connect, save the
current tab, Livestore sync. AI summaries/tagging happen server-side in the web app, not the
extension itself — describe them as a Cloudstash account benefit, not an extension feature.

## Identity

- **Name:** `Cloudstash`
- **Tagline / short description (≤132 chars):**
  `Save the current page to your Cloudstash account in one click — then read it back, summarized and tagged, anywhere.`
- **Category:** Productivity → Tools
- **Language:** English (United States)
- **Single-purpose declaration** (Chrome Web Store policy, one sentence):
  `Save the current browser tab to the user's Cloudstash account.`

## Detailed description (≤16,384 chars)

```
Cloudstash is a link-saving app with AI-powered summaries. This extension is the fastest
way to stash the page you're on without leaving it.

Click the toolbar icon and the current tab is saved to your Cloudstash account. That's it.
Your saved links sync instantly to the Cloudstash web app, where each one is automatically
summarized and tagged so you can actually find it again later.

WHAT YOU CAN DO
• Save the current tab in one click from the toolbar popup
• See your most recent saves right in the popup
• Everything syncs in real time with the Cloudstash web app and your other connected
  clients (Raycast, Telegram)

HOW IT CONNECTS
Click "Connect" and the extension links to your account in one step — it opens Cloudstash,
connects automatically, and you're done. No codes to copy, and no password is ever stored
in the browser. You can disconnect at any time from the popup.

PRIVACY
The extension talks to Cloudstash to connect (HTTPS) and sync (WSS). It reads the URL of
the tab you choose to save — it does not read page contents or track your browsing. The
only images the popup loads are your own account avatar (from your Google account) and the
favicons of the sites you've saved; nothing else goes to third parties. All traffic is
encrypted in transit.

REQUIREMENTS
The extension is free with any Cloudstash account — sign up at https://cloudstash.dev and
connect in one step.
```

## Permission justifications

Paste each verbatim into the matching field. Keep ≤1000 chars each.

| Permission             | Justification                                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `offscreen`            | Hosts the Livestore SharedWorker and the sync WebSocket so saves complete and stay in sync while the popup is closed. Workers-only reason; no DOM access. |
| `storage`              | Stores the paired API key locally so the user authenticates once instead of on every save.                                                                |
| `unlimitedStorage`     | The local Livestore SQLite mirror (OPFS) can exceed the default 5 MB quota for users with many saved links.                                               |
| `tabs`                 | Reads the active tab's URL to pre-fill and save it. Does not read tab contents or browsing history.                                                       |
| host: `cloudstash.dev` | The extension's only network destination — used for the pairing/connect flow (HTTPS) and Livestore sync (WSS).                                            |

## Privacy practices form

- **Data collected:**
  - _Authentication information_ — the paired API key.
  - _Web history_ — only the URLs the user explicitly chooses to save (not general browsing).
- **Purpose:** authenticate the user with their Cloudstash account; save the links they action on.
- **Images loaded in the popup:** the user's own account avatar (from their Google account)
  and the favicons of the sites they've saved, to render the recent-saves list. No other
  third-party requests. The extension reads only the URL of the tab being saved — not page
  contents.
- **Sold to third parties?** No.
- **Used/transferred for purposes unrelated to core function?** No.
- **Used/transferred to determine creditworthiness or for lending?** No.
- **Encryption in transit:** Yes — WSS for sync, HTTPS for REST.
- **Deletion mechanism:** Yes — account + data deletion via Cloudstash account settings.
- **Privacy policy URL:** `https://cloudstash.dev/privacy` (route exists; confirm it carries
  an extension-specific data-handling note before submitting).

## Assets still needed (not text)

- [x] Icons 16/32/48/128 — see [[chrome-extension-publishing]] §2. (Generated in `apps/extension/public/icon/`.)
- [ ] ≥1 screenshot at 1280×800 (popup connect, popup save, web connect page) — max 5. **Still needed** — real product captures, not the branded filler.
- [x] Promo tiles: 440×280 small + 1400×560 marquee — generated, in `apps/extension/store-assets/`.

## Brand reference

- Mark: the torus-knot (`CloudstashLogo`), not the React atom in `src/logo.svg`.
- Tile palette ("Midnight"): gradient `#0a0f2c` → `#2d5fb8`, white knot.
