# Integrations — Spec

This document specifies current integration realizations. It builds on
[requirements.md](./requirements.md).

## Status

Active.

## Realizations

| Integration      | Auth/connection                                         | Transport into library                                               | Lifecycle                                           |
| ---------------- | ------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| Chrome extension | web-minted paired API key + extension-origin allowlist  | direct LiveStore WebSocket client; local browser adapter             | key revoke/disconnect; extension Web Store release  |
| Raycast          | browser verification exchange → device-labelled API key | `integrations`-gated ingest Queue with `source: raycast`             | key revoke; separate npm/Raycast repo               |
| Telegram         | webhook secret + chat mapping to workspace key          | operation-time `integrations` check → Queue                          | connect/check/confirm/status/disconnect; KV mapping |
| Public API       | Bearer API key                                          | list/search/get/save/update via LinkProcessorDO; legacy ingest Queue | request-time capability and key checks              |
| MCP clients      | OAuth 2.1 + PKCE/DCR; workspace consent                 | stateless HTTP; matching link operations via LinkProcessorDO         | re-consent/revoke; five-minute JWT                  |
| X bookmarks      | linked encrypted OAuth account                          | per-user alarm poll → Queue                                          | reconcile/pause/resume/disconnect                   |

Settings presents the end-user connections in capture-first order:
Telegram, X bookmarks, MCP, Chrome, then Raycast. A single divided
settings surface gives each integration a compact single-line row with its mark,
name, minimal state-specific description, and a clear right-aligned control.
Descriptions truncate rather than wrap. Disconnected integrations expose their
connect action; connected integrations expose disconnect directly without a
separate status label. Low-impact integration disconnects execute directly;
their right-aligned control uses a restrained, right-anchored Motion transition
between connected and disconnected actions without changing row height. Visible
action labels rely on their row context while accessible names include the
integration. Row text shares one typographic baseline inside a bullet-separated
text group centered against the integration mark, while the right-side control
remains vertically centered in the row. MCP setup stays beneath the compact row;
device details for Chrome and Raycast expand only when
requested. Device-key revocation uses a targeted inline confirmation, prevents
repeat submission while pending, and remains confirmable when revocation fails.
After X authorization completes, its callback returns to the initiating route
with a scoped transient result parameter. The authenticated route opens Settings
at Integrations, announces the successful connection, and immediately removes
only that result parameter with replace navigation so unrelated search state is
preserved.

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
access to the displayed workspace. The Pro-gated MCP card offers one copy-ready
`add-mcp` command for locally installed coding agents and the current origin's
raw `/mcp` URL for manual client configuration; runtime entitlement stays
authoritative. The Worker supports MCP 2026 and the 2025
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
later account check is also a logout signal. When opened, the popup queries the
active tab URL, title, and favicon so it can present the pending save. It does
not read page content. Repository privacy and product copy describe this
behavior; the published Web Store listing remains tracked by
[DELTA-017](../../.delta/DELTA-017-extension-read-and-advertised-capture-mismatch.md).

## Raycast

The separately released Raycast extension initiates a browser connect flow. The
web app stores a short-lived verification record and the extension exchanges its
code for a labelled key. Save commands reuse the public intake transport, but
the server-stamped key source selects the `integrations` capability and preserves
`source: raycast`; caller-provided source text is never trusted. Main-repo
server contracts live under `src/cf-worker/connect/`; client source lives in
`bohdanbirdie/cloudstash-raycast` and is not imported.

## Telegram

The grammY webhook verifies `TELEGRAM_WEBHOOK_SECRET`, resolves a connected chat
to workspace credentials in KV, rechecks current approval, membership, and the
`integrations` capability for every capture, extracts URLs, and sends queue
messages. A downgrade suspends the retained connection without deleting it, so
restoring access resumes the same mapping. The
processor emits stateless progress drafts from current workspace state and final
per-link replies from terminal events. Telegram API failure is best-effort and
never rolls back the save. A reverse user→chat index supports account deletion.

## X Bookmark Sync

The X OAuth provider is available only when both `X_CLIENT_ID` and
`X_CLIENT_SECRET` are non-empty. Missing or partial X configuration omits that
provider without disabling Google, session, or MCP authentication.

One `XBookmarkSyncDO` per user owns a bound workspace, provider identity,
status, legacy head watermark, recent checkpoint ring, resumable traversal,
provider-read usage, user pause preference, and persisted polling control. Its
alarm starts at 30 seconds after connection or observed activity, then relaxes
through one-, two-, and five-minute intervals as inactivity continues. A new
bookmark returns the cadence to 30 seconds. Transient failures use a separately
persisted one-to-fifteen-minute exponential backoff, while provider rate limits
preserve healthy cadence and honor the provider delay with a small positive
buffer. Missing or invalid polling control defaults to the fast cadence, so
existing actors need no migration.
Its idempotent reconciliation boundary derives effective activity from the
linked X account, the workspace's current `xBookmarkSync` capability, and the
independent pause preference. Connect and resume requests validate current
identity, approval, and membership before reaching the actor; recurring alarms
do not poll identity tables on every cadence tick. The explicit OAuth return
reconciles immediately. Stripe/admin entitlement changes enqueue at-least-once X
reconciliation messages; every alarm
reconciles before provider I/O; and a daily scan of linked X accounts enqueues
repair messages for missed delivery. An established workspace binding wins over
later repair messages for another membership, so one per-user poller cannot be
rebound nondeterministically. When the bound workspace loses the
`xBookmarkSync` capability, reconciliation suspends polling and removes the
alarm while retaining the linked account, binding, pause preference, identity,
and watermark. Restoring the capability re-arms polling from that watermark;
the Settings row communicates the suspension and offers both upgrade and
disconnect actions. If Billing confirms that the bound workspace no longer
exists, reconciliation also releases that stale binding so a later explicit
signal can bind a valid workspace. Pause and resume complete only after the
durable preference and alarm transition succeeds; transient DO/storage failures
remain retryable service failures. The user-facing Settings row can resume an
already-paused connection or disconnect it; pausing remains an internal
administration operation.

On first entitled connect the DO probes one newest bookmark and pins the
watermark/checkpoint without import. Later polls request one bookmark at a time
from the newest item until they reach any member of a bounded recent-checkpoint
ring. This keeps provider reads proportional to the changed prefix and survives
one disappearing checkpoint. Traversals have a fixed request budget per alarm,
including the initial head probe;
long walks persist their pagination token and discovered bookmark payloads,
then continue on a near-term alarm without advancing the head. Completed walks
admit unseen bookmarks oldest-first through the workspace `LinkProcessorDO`,
which enforces the plan's subscription-aligned monthly bookmark allowance
across every member's X connection before sending to the common Queue. Accepted
prefixes become durable checkpoints. Queue failures and allowance exhaustion
retain the unfinished suffix; the latter sleeps until reset and consumes the
new window while catching up. A workspace that continually creates more than
its allowance can remain behind rather than silently discarding bookmarks.

The per-user poller also maintains a monthly provider-read safety ceiling above
the product allowance. It counts a tweet once per UTC day within the usage
window, so repeated adaptive probes of the same head do not consume the local
ceiling. Reaching it preserves any traversal and schedules the next usage-window
reset. The legacy watermark remains for compatible state/status reads, while
the checkpoint ring owns recovery. Missing durable recovery or provider-usage
state initializes to its documented empty value; present malformed state fails
closed as a typed storage error instead of resetting a cost-control counter.
401/402 both park the actor for reconnect, and the actor records which of the
two caused it. A 401 is a credential problem the DO can verify itself, so
periodic reconciliation may clear that park once the credential checks out. A
402 is a provider access-level refusal that the credential check cannot observe
— it is raised by the bookmarks endpoint while identity lookups still succeed —
so only an explicit user reconnect clears it, and reconciliation alone leaves
the actor parked. 429 honors provider retry; other failures use bounded backoff
that survives DO eviction. Reconciliation that reactivates a paused, suspended,
or reconnected actor resets it to fast polling. Entitlement changes that increase
allowance may pull an existing reset alarm forward so newly available capacity
is usable promptly. Periodic
repair of an otherwise active actor preserves idle cadence, failure backoff,
watermark, and identity.

The official API exposes only roughly the 800 most recent bookmarks and no
bookmark-created timestamp or server-side incremental filter. Full historical
sync is not a supported contract. The lifecycle choice and deferred
transactional-outbox threshold are recorded in
[decision 0001](./.decisions/0001-reconcile-x-sync-from-signals-and-repair.md).
The adaptive cadence and eviction-survival policy are recorded in
[decision 0002](./.decisions/0002-adapt-x-polling-to-account-activity.md).
The exact bounded traversal and workspace allowance are recorded in
[decision 0003](./.decisions/0003-bound-x-bookmark-recovery-and-admission.md).
