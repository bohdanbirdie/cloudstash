# Integrations — Spec

This document specifies current integration realizations. It builds on
[requirements.md](./requirements.md).

## Status

Active.

## Realizations

| Integration      | Auth/connection                                         | Transport into Vault                                     | Lifecycle                                           |
| ---------------- | ------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| Chrome extension | web-minted paired API key + extension-origin allowlist  | direct LiveStore WebSocket client; local browser adapter | key revoke/disconnect; extension Web Store release  |
| Raycast          | browser verification exchange → device-labelled API key | public ingest Queue                                      | key revoke; separate npm/Raycast repo               |
| Telegram         | webhook secret + chat mapping to workspace key          | Queue                                                    | connect/check/confirm/status/disconnect; KV mapping |
| Public API       | Bearer API key                                          | `POST` Queue; `GET` ChatAgentDO read client              | request-time capability and key checks              |
| X bookmarks      | linked encrypted OAuth account                          | per-user alarm poll → Queue                              | pause/resume/disconnect                             |

## Chrome Extension

The WXT Manifest V3 app contains a background service worker, offscreen document
hosting the LiveStore client, and popup. The authenticated web route mints and
hands off a paired key via `externally_connectable`. Sync payload validation
checks key workspace metadata and `EXTENSION_ID_ALLOWLIST`. Popup disconnect
best-effort revokes the server key and always clears local credentials; a 401 on
later account check is also a logout signal. The popup currently queries URL,
title, and favicon when opened rather than when Save is clicked; this privacy/
least-privilege mismatch is tracked by
[DELTA-017](../../.delta/DELTA-017-extension-read-and-advertised-capture-mismatch.md).

## Raycast

The separately released Raycast extension initiates a browser connect flow. The
web app stores a short-lived verification record and the extension exchanges its
code for a labelled key. Save commands use the public intake API, which
currently records Raycast as `api` and couples use to `publicApi`; see
[DELTA-036](../../.delta/DELTA-036-raycast-capture-loses-source-and-couples-capabilities.md).
Main-repo
server contracts live under `src/cf-worker/connect/`; client source lives in
`bohdanbirdie/cloudstash-raycast` and is not imported.

## Telegram

The grammY webhook verifies `TELEGRAM_WEBHOOK_SECRET`, resolves a connected chat
to workspace credentials in KV, extracts URLs, and sends queue messages. The
processor emits stateless progress drafts from current workspace state and final
per-link replies from terminal events. Telegram API failure is best-effort and
never rolls back the save. A reverse user→chat index supports account deletion.

## X Bookmark Sync

One `XBookmarkSyncDO` per user owns provider identity, status, watermark, retry
state, and a 30-second alarm. On first connect it probes one newest bookmark and
pins the watermark without import. Later polls probe for change, page at 50
items until the watermark, enqueue unseen bookmarks oldest-first, then advance
the watermark. Partial traversal does not advance it, but individual Queue-send
failures are currently swallowed before advancement; this data-loss path is
tracked by
[DELTA-012](../../.delta/DELTA-012-x-watermark-advances-after-enqueue-failure.md).
401/402 require reconnect; 429 honors provider retry;
other failures use bounded backoff whose attempt counter currently resets on DO
wake.

The official API exposes only roughly the 800 most recent bookmarks and no
bookmark-created timestamp or server-side incremental filter. Full historical
sync is not a supported contract. The current alarm path does not recheck the
workspace entitlement after downgrade, contrary to the entitlement requirement;
this is tracked by
[DELTA-015](../../.delta/DELTA-015-ongoing-integrations-bypass-entitlement-rechecks.md).
