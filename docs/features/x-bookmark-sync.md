# X Bookmark Sync

Automatically sync new X (Twitter) bookmarks into Cloudstash. Per-user adaptive
polling via Durable Object, 30-second to five-minute latency based on recent
activity, zero D1 polling state, gated to Pro tier.

## Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         CONNECT (one-time)                                │
│                                                                           │
│  ┌──────────┐  1. authClient.oauth2.link({providerId:"x"})                │
│  │  Web UI  │ ────────────────────────────────────────────►              │
│  └──────────┘                                                             │
│       │                                                                   │
│       │ 2. PKCE flow (HTTP Basic for X token endpoint)                    │
│       ▼                                                                   │
│  ┌──────────┐  3. account row + encrypted tokens   ┌──────────┐          │
│  │  Better  │ ──────────────────────────────────►  │    D1    │          │
│  │   Auth   │                                       │ account  │          │
│  └──────────┘                                       └──────────┘          │
│       │                                                                   │
│       │ 4. account.create.after hook                                      │
│       ▼                                                                   │
│  ┌──────────────┐  5. DO.start()                                          │
│  │ X_BOOKMARK_  │ ──── fetches /users/me                                  │
│  │   SYNC_DO    │ ──── persists identity in DO storage                    │
│  │ (per user)   │ ──── PINS watermark to current head (no enqueue!)       │
│  └──────────────┘ ──── arms fast 30s alarm                                │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                    POLLING (adaptive 30s → 5m)                            │
│                                                                           │
│  ┌──────────────┐  1. alarm fires      ┌──────────┐                      │
│  │ X_BOOKMARK_  │ ───────────────────► │ X API v2 │                      │
│  │   SYNC_DO    │                      │/bookmarks│                      │
│  └──────────────┘                      └──────────┘                      │
│       │                                                                   │
│       │ 2. probe max_results=1                                            │
│       │ 3. if newestId is a recent checkpoint → done                      │
│       │ 4. else walk max_results=1 pages to a checkpoint                  │
│       │ 5. persist and continue after 25 total requests if needed         │
│       │ 6. admit oldest-first via workspace LinkProcessorDO → Queue       │
│       │ 7. advance checkpoints + legacy watermark                        │
│       │ 8. reschedule alarm                                               │
└──────────────────────────────────────────────────────────────────────────┘
```

## X API constraints (research findings)

These are the load-bearing facts. Verified against `docs.x.com`, X dev community forums, and the `xdevplatform/twitter-api-java-sdk` (generated from the official OpenAPI).

### No server-side filtering exists

`GET /2/users/{id}/bookmarks` accepts only:

- `max_results` (1-100)
- `pagination_token`
- field selectors (`tweet.fields`, `expansions`, etc.)

**Not supported**: `since_id`, `until_id`, `start_time`, `end_time`, or any filter on bookmark-creation time. This has been a top-requested feature on dev forums for years; never shipped. **The watermark MUST be tracked client-side.**

### No bookmark-creation timestamp anywhere

Returned tweets carry only `created_at` (tweet creation time, not bookmark time). Order in the response IS the only signal of bookmark recency (reverse-chronological by bookmark time, confirmed via forum threads — the docs don't specify).

### Hard ~800-bookmark cap, all tiers

Documented in the integration guide: "you will get back 800 of your most recent Bookmarked Posts." `next_token` simply stops appearing past that point. **This cap applies to Basic, Pro, and Enterprise alike — no paid tier unlocks it.** Older bookmarks are unrecoverable through the official API.

### Pagination bug: don't use `max_results=100`

Long-standing bug (years old, never fixed): at `max_results=100`, `next_token`
often disappears after 2-3 pages well before the 800 cap. The current sync does
not depend on the historical `max_results=50` workaround: it requests one item
per page so provider reads stay proportional to the changed prefix.

### Rate limit (per user OAuth token)

- 180 GET requests / 15-min window per user
- 50 POST/DELETE / 15-min per user

The fastest 30s cadence = 30 requests/15min/user. An account idle for six
hours polls every five minutes = 3 requests/15min/user. Both remain under the
limit.

### Pricing (April 20, 2026 change)

`/bookmarks` moved to the "Owned Reads" bucket. Empty responses (no new bookmarks since last poll) are free, so per-user cost scales with bookmark velocity rather than poll frequency.

## Architecture decisions

### Why Durable Object (vs. cron worker)

- **CF cron minimum is 1 minute** — cannot provide the active 30s cadence.
- Cron + fan-out via Queue rebuilds per-user state in D1 and reasons about it on every tick. DO gives per-user state isolation for free.
- DO aggressively hibernates — only billed for the ~250ms of active alarm execution.
- Persisted per-user cadence and failure control survives DO eviction; 429s
  retain that state and honor the provider delay.
- Pause/resume/disconnect = direct alarm manipulation on one DO. No need to consult an "active users" table.

### State storage: DO SQLite (not D1, not KV)

DO SQLite wins on cost and isolation for high-frequency per-user state:

- Reads are effectively free once the DO is hot (in-memory).
- Writes stay well under the included tier at our cadence.
- D1 would pay on every poll for both read and write.
- KV is read-dominated and still meaningfully more expensive than DO SQLite here.

**The original `x_sync_state` D1 table was eliminated before merge** (migration `0010_*` reverted — current migrations end at `0009`). All sync state now lives in DO storage. Better Auth's `account` table remains the source of truth for "is X linked" (plus encrypted OAuth tokens).

Storage operations are typed (`XSyncStorageError`) so transient CF Storage failures surface as warnings rather than silent fiber defects.

Fields stored in DO SQLite (per user):

- `xUserId` (X account id)
- `xUsername` (display)
- `watermarkTweetId` (the sync mechanic)
- `status` (`active` | `needs_reconnect` | `paused` | `disconnected`)
- `syncEnabled` (user toggle)
- `pollControl` (idle start + bounded transient-failure count)
- recent checkpoint ring and resumable scan state
- subscription-window provider-read usage

`lastSyncedAt` lives in DO memory only — surfaced via the `DO.status()` RPC. Persisting it on every poll would have eaten the included writes tier. UI shows "—" briefly until the next adaptive alarm fires (at most five minutes) on cold start. Acceptable.

## The checkpoint mechanic

The legacy watermark remains the newest completed head, while a bounded ring of
recent successful tweet IDs provides the traversal boundary. On each poll:

1. Probe newest bookmark (1 result).
2. If `newestId` is a recent checkpoint → nothing new, done.
3. If different → request one result per page until any checkpoint, persisting
   long walks across alarms.
4. Admit everything newer oldest-first through the workspace monthly allowance,
   then advance the head/checkpoint ring.

This prevents reprocessing, bounds normal provider reads, and defines the "from
now on" boundary.

### Cost-safety: connect does NOT import existing bookmarks

`initializeWatermarkEffect` on fresh connect:

1. Probes the single newest bookmark.
2. **Pins the watermark to that ID without enqueuing anything.**
3. Returns.

A user with 800 existing bookmarks gets **zero** of them imported. We sync from connect-time onward only. Without this guard, a fresh connect would incur material X API spend plus a much larger AI-summary bill, on top of a multi-day processing queue backlog.

An earlier prototype lacked this guard and a single connect produced exactly that outcome. The fix is now locked in by a dedicated regression test. With 800 existing bookmarks scripted, the test asserts:

- `getBookmarks` is called exactly once with `max_results: 1` and no pagination token
- `setWatermark` is called once with the newest ID
- Zero items are enqueued

There is also a **second safety net** in `pollReconciledEffect`: if the watermark
is null (e.g., `initializeWatermark` failed during signup due to 402/429), the
first successful poll pins the watermark and skips enqueuing. Covered by a
separate test.

## Plan gating (Pro-only)

X bookmark sync is gated to the **Pro tier**. Free and Plus users without a
connection see an "Upgrade to Pro" CTA instead of Connect. A retained connection
that becomes suspended shows Upgrade alongside Disconnect.

### Entitlement signal

Gating uses the shared billing capability projection: the tier default can be
overridden per workspace, and each lifecycle boundary reads the effective
`xBookmarkSync` capability rather than duplicating tier checks.

### Defense in depth

| Layer               | Behavior                                                                        |
| ------------------- | ------------------------------------------------------------------------------- |
| OAuth completion    | Requires `xBookmarkSync` before activating the connection.                      |
| Entitlement signals | Stripe and admin changes enqueue idempotent per-user reconciliation.            |
| DO alarm self-heal  | Reconciles before provider I/O and removes its alarm when capability is absent. |
| Periodic repair     | A daily scan reconciles linked accounts after missed signal delivery.           |
| UI                  | Suspended connections offer Upgrade to Pro and Disconnect.                      |

### Downgrade behavior

If a Pro user with X connected downgrades:

- A scheduled cancellation retains Pro access and bookmark sync through the
  paid period.
- Once Stripe projects the workspace to Free, reconciliation marks the poller
  `suspended` and removes its alarm before any further X request.
- The linked account, workspace binding, user pause preference, X identity, and
  watermark remain intact; explicit Disconnect still purges them.
- Re-upgrading restores the alarm without another OAuth round-trip. The next
  polls continue from the retained watermark, so accessible bookmarks created
  during suspension can be imported.

Stripe/admin signals make the transition prompt, every alarm rechecks the
capability before provider I/O, and the daily repair scan closes missed-delivery
gaps.

## Deferred / future work

### Paid one-time "import existing bookmarks" (max 800)

Reframed from the original "full historical sync" vision. The 800 cap applies to all tiers, so this is genuinely the most you can offer via the official API. Implementation: a button that calls a DO method that walks the pagination + enqueues everything.

### True "import all historical bookmarks" (>800)

**Not feasible via the official API at any tier.** Only browser automation (Playwright) reaches deeper into a user's bookmark history. Brittle, TOS-risky, not viable as a clean paid feature. **Do not build this.**

### Bookmark-deletion mirroring

If a user un-bookmarks on X, we currently leave the link in Cloudstash. The API exposes only the current bookmark set, not a deletion event. Implementing this would require comparing every poll's full set against our local store — expensive and rarely wanted. Deferred indefinitely.

## Implementation notes

- **DO storage uses the SQLite-backed KV API**. Reads run through guarded `typeof === "string"` checks before applying brand tags — raw casts to branded types are not allowed.
- **No `lastSyncedAt` persisted**. In-memory only, surfaces via the `status()` RPC. Resets to `null` on cold start (UI shows "—" briefly).
- **`max_results: 1`** for the probe and every traversal page. One alarm may
  make at most 25 provider requests including its initial probe; unfinished
  traversal state is persisted and resumed by a near-term alarm.
- **Mid-walk pagination errors DEFER** (never advance the watermark). The
  persisted scan retains the discovered prefix and pagination token, so the
  next alarm resumes from the failed page instead of re-walking from the head.
  Locked in by unit and real-alarm eviction tests.
- **401 / 402 on the probe → mark `needs_reconnect`** and stop alarming. 429
  → reschedule after the response's `retry-after` plus a one-second buffer.
  Generic API errors on the probe → persisted exponential backoff up to 15 min
  (handled by the DO, not by the poll effect — the effect surfaces the typed
  failure cleanly).
- **Post-OAuth hook is trivial** — entitlement check, then start the DO. The DO fetches `/users/me` itself.
- **Account deletion** — the workflow step calls the DO's `disconnect()`, which wipes DO storage. Runs after the link-processor wipes so any in-flight queue messages drop.
- **Full Layer-based DI**: `pollReconciledEffect` and
  `initializeWatermarkEffect` take no `env`. All dependencies (X API client,
  state store, link-queue client, auth client, DB client) come via Layer; typed
  stub Layers drive unit tests. The link-queue service wraps the internal DO RPC
  so payloads are assertable without replacing global bindings.
- **Tagged errors** — `XUnauthorizedError` / `XPaymentRequiredError` / `XRateLimitedError` / `XApiError` from the API client; `XSyncStorageError` from DO storage; `XSyncSideEffectError` from CF RPC/queue/alarm bridges; `NoAccessTokenError` from Better Auth fail-through. All `Schema.TaggedError` so `catchTag(s)` and OTel logs stay structured.
- **OAuth-cancel recovery (UI)** — the status hook clears the connect lock on `visibilitychange` (user returned to the tab) or after a 60s safety timeout, so closing the OAuth popup doesn't permanently disable buttons.

## References

- [Get Bookmarks reference (docs.x.com)](https://docs.x.com/x-api/users/get-bookmarks)
- [Bookmarks integration guide](https://developer.x.com/en/docs/x-api/tweets/bookmarks/integrate)
- [BookmarksApi.md — Java SDK (OpenAPI-derived)](https://github.com/xdevplatform/twitter-api-java-sdk/blob/main/docs/BookmarksApi.md)
- [Pagination stops after ~3 pages at max_results=100](https://devcommunity.x.com/t/bookmarks-api-v2-stops-paginating-after-3-pages-no-next-token-returned/257339)
- [Bookmark API additions feature request (still open)](https://devcommunity.x.com/t/bookmark-api-additions/259589)
- [How to get more than 800 bookmarks? (you can't)](https://devcommunity.x.com/t/how-to-get-more-than-800-bookmarks/204704)
- [April 2026 pricing update — Owned Reads](https://devcommunity.x.com/t/x-api-pricing-update-owned-reads-now-0-001-other-changes-effective-april-20-2026/263025)
- [Cloudflare DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
