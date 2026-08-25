# Integrations — Spec

This document specifies current integration realizations. It builds on
[requirements.md](./requirements.md).

## Status

Active.

## Realizations

| Integration      | Auth/connection                                         | Transport into Vault                                                 | Lifecycle                                           |
| ---------------- | ------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| Chrome extension | web-minted paired API key + extension-origin allowlist  | direct LiveStore WebSocket client; local browser adapter             | key revoke/disconnect; extension Web Store release  |
| Raycast          | browser verification exchange → device-labelled API key | public ingest Queue                                                  | key revoke; separate npm/Raycast repo               |
| Telegram         | webhook secret + chat mapping to workspace key          | Queue                                                                | connect/check/confirm/status/disconnect; KV mapping |
| Public API       | Bearer API key                                          | list/search/get/save/update via LinkProcessorDO; legacy ingest Queue | request-time capability and key checks              |
| MCP clients      | OAuth 2.1 + PKCE/DCR; workspace consent                 | stateless HTTP; matching link operations via LinkProcessorDO         | re-consent/revoke; five-minute JWT                  |
| X bookmarks      | linked encrypted OAuth account                          | per-user alarm poll → Queue                                          | reconcile/pause/resume/disconnect                   |

## MCP Clients

Clients use protected-resource discovery and bounded, rate-limited public DCR;
registrations may use only the `none` token authentication method and reject
confidential-client key/assertion metadata. For legacy local clients that omit
`application_type`, the registration boundary infers `native` only when every
redirect uses cleartext HTTP on the exact `localhost`, `127.0.0.1`, or `[::1]`
loopback host; explicit types, mixed redirect sets, and other hosts remain under
Better Auth's standard validation. Expired OAuth verification and
client-assertion replay records are cleaned on a bounded token-request cadence.
Consent marks dynamic clients unverified, shows the callback target, and pins
access to the displayed workspace. The Pro-gated card shows the current
origin's `/mcp` URL, OAuth setup, scopes, and protocol compatibility; runtime
entitlement stays authoritative. The Worker supports MCP 2026 and the 2025
stateless fallback. Protected-resource discovery omits the optional scope list
so clients fall back to the authorization server's complete scope metadata,
request `offline_access`, and receive a rotating refresh token with a 30-day
sliding lifetime. Its initialize response advertises the Cloudstash display
name, website, and same-origin public PNG icons through standard MCP
implementation metadata; whether they are rendered remains client-controlled.
CIMD remains disabled until its untrusted fetch is SSRF-safe. Read tools list,
search, and get; write tools save and update link state/tags individually or in
bounded batches, and an explicit ID selector cannot exceed its declared limit.
Search defaults to ranked any-term matching and accepts an
all-term mode. Collection filters use `active`, `archive`, or `any`, with legacy
`all` retaining its non-archived meaning. Tool discovery exposes concrete JSON
Schema types. Reprocessing remains unavailable.

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

The X OAuth provider is available only when both `X_CLIENT_ID` and
`X_CLIENT_SECRET` are non-empty. Missing or partial X configuration omits that
provider without disabling Google, session, or MCP authentication.

One `XBookmarkSyncDO` per user owns a bound workspace, provider identity,
status, watermark, user pause preference, retry state, and a 30-second alarm.
Its idempotent reconciliation boundary derives effective activity from the
linked X account, the bound workspace's current `xBookmarkSync` capability, and
the independent pause preference. The explicit OAuth return reconciles
immediately. Stripe/admin entitlement changes enqueue at-least-once X
reconciliation messages; every alarm
reconciles before provider I/O; and a daily scan of linked X accounts enqueues
repair messages for missed delivery. An established workspace binding wins over
later repair messages for another membership, so one per-user poller cannot be
rebound nondeterministically. If Billing confirms that the bound workspace no
longer exists, reconciliation suspends polling, removes the alarm, and releases
that stale binding so a later explicit signal can bind a valid workspace. Pause
and resume complete only after the durable preference and alarm transition
succeeds; transient DO/storage failures remain retryable service failures.

On first entitled connect the DO probes one newest bookmark and pins the
watermark without import. Later polls probe for change, page at 50 items until
the watermark, enqueue unseen bookmarks oldest-first, then advance the
watermark. Partial traversal does not advance it, but individual Queue-send
failures halt the poll. When an older bookmark was already enqueued before a
later failure, the DO checkpoints that successful prefix so the next poll
retries the failed bookmark without duplicating or skipping earlier work.
401/402 require reconnect; 429 honors provider retry;
other failures use bounded backoff whose attempt counter currently resets on DO
wake.

The official API exposes only roughly the 800 most recent bookmarks and no
bookmark-created timestamp or server-side incremental filter. Full historical
sync is not a supported contract. The lifecycle choice and deferred
transactional-outbox threshold are recorded in
[decision 0001](./.decisions/0001-reconcile-x-sync-from-signals-and-repair.md).
