# Server-side ingest durability — links lost when the DO backend is disabled

**Status:** Research (future work — data preservation). Do not fix yet.

Related: [[architecture/sync-backend-do-hibernation-billing]] (the DO-duration cap that triggered the outage), [[todos/admin-server-ahead-alert]] (existing alerting hook we can reuse).

## Incident (2026-06-11)

The free-tier **daily Durable Object duration cap** was exceeded, so Cloudflare
disabled the account's Durable Objects for the rest of the UTC day
(`docs/architecture/sync-backend-do-hibernation-billing.md:381` — "The DO hit
the daily cap ~19:00 UTC on 06-11 and was disabled until the 00:00 UTC reset").

During the outage the user sent a link to the Telegram bot. The bot:

- showed a "Saving link" streaming indicator, then
- never stored the link, never replied, never synced it.

The link is effectively **lost** — there is no durable, app-visible record to
replay. After the 00:00 UTC quota reset (DOs back up), a freshly sent link saved
fine. This doc explains exactly why, maps which ingest channels are exposed, and
lays out durable-capture options.

## Verified root-cause mechanism

The web app is local-first, but **server-side ingests are not** — and the
hypothesis "there is no durable buffer" is only _half_ right: there **is** a
buffer (a Cloudflare Queue), but its failure handling dead-ends.

End-to-end Telegram path:

1. `POST /api/telegram` → `handleTelegramWebhook` (`src/cf-worker/index.ts:237`,
   `src/cf-worker/telegram/bot.ts:126-135`).
2. `handleLinks` sends the optimistic draft and enqueues
   (`src/cf-worker/telegram/handlers.ts:16-32`). The draft
   (`messenger.draft` → `ctx.replyWithDraft`,
   `src/cf-worker/telegram/services/messenger.live.ts:8-16`) is an **ephemeral
   Telegram streaming draft** — not a persisted message.
3. Enqueue: `env.LINK_QUEUE.send({ source:"telegram", storeId, url, sourceMeta })`
   (`src/cf-worker/telegram/services/link-queue.live.ts:14-24`). **This
   succeeds** — Queues producers are independent of the DO quota — so the only
   user-facing failure branch (`TelegramQueueSendError` → "Failed to save link",
   `handlers.ts:26-35`) does **not** fire. The user gets no error.
4. grammy's `cloudflare-mod` adapter resolves the webhook response via
   `end() → ok()` (HTTP **200**) after the handler completes
   (`node_modules/grammy/out/convenience/frameworks.js`, `cloudflareModule`).
   So Telegram is told the update was processed.
5. The queue consumer (`src/cf-worker/index.ts` `queue` export → matches only
   `"cloudstash-link-queue"`) runs `handleQueueBatchEffect`
   (`src/cf-worker/queue-handler.ts:71-135`), which calls
   `stub.ingestAndProcess(body)` on `LinkProcessorDO` (`queue-handler.ts:91-94`).
6. `LinkProcessorDO.ingestAndProcess` (`durable-object.ts:602-671`) calls
   `getStore()` → `createStoreInternal()` →
   `createStoreDoPromise({ … syncBackendStub: env.SYNC_BACKEND_DO.get(…) })`
   (`durable-object.ts:171-201`). The link is only ever created here, as a
   Livestore event: `repo.commitEvent(events.linkCreatedV2(…))`
   (`do-programs.ts:65-74`).

**Where it fails:** while DOs are disabled account-wide, the edge rejects DO
invocation. Either the RPC into `LinkProcessorDO` (step 5) or the
`createStoreDoPromise` connection to the disabled `SyncBackendDO` (step 6)
throws/hangs. The queue handler wraps it as `QueueProcessError` and calls
`msg.retry()` (`queue-handler.ts:108-119`). After `max_retries: 3`
(`wrangler.jsonc:86-93`) the message is dead-lettered to **`cloudstash-link-dlq`**
— which **has no consumer** (the `queue` export matches only the main queue;
the DLQ name appears only in `wrangler.jsonc:92` and a comment in
`queue-handler.ts:15`). The retries exhaust within minutes, far inside a
multi-hour outage, so the message dead-letters _during_ the outage and is never
re-driven on recovery. It expires after the queue retention window (~4 days
default) and is gone.

**Why "saving link" but no error and no reply:** the Telegram Worker (not a DO)
ran fine — draft sent, enqueue OK, 200 returned. The failure happened _later_,
in a separate queue-consumer invocation calling into the DO. The "Link saved!"
reply is emitted from inside the DO via `SourceNotifier.finalizeProgress`
(`src/cf-worker/link-processor/services/source-notifier.live.ts:63-81`), which
never ran. The failure is swallowed into the queue-handler error log + the
undrained DLQ.

## Data-loss surface (per channel)

| Channel          | Entry point                                                                                                                              | How the link is created                                                                                                                     | Survives a DO/sync-backend outage?                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Web app          | `/sync` WS livestore client                                                                                                              | local-first commit to OPFS eventlog, re-syncs on reconnect (`src/livestore/store.ts:20-24`, `makePersistedAdapter` `storage:{type:"opfs"}`) | SAFE — event persists locally, re-syncs                                                                     |
| Chrome extension | `/sync` WS livestore client (paired API key; `src/cf-worker/connect/extension.ts`)                                                       | local-first commit in the extension's own storage, re-syncs                                                                                 | SAFE — same model as web (durable on that device until sync)                                                |
| Telegram bot     | `POST /api/telegram` → `LINK_QUEUE.send` (`telegram/services/link-queue.live.ts:14-24`)                                                  | queue → `LinkProcessorDO.ingestAndProcess` → `createStoreDoPromise` → `linkCreatedV2`                                                       | AT RISK — DO RPC/store-create fails → retry×3 → DLQ (undrained) → lost; user sees false "saving" + no reply |
| Raycast          | `POST /api/ingest` Bearer key (`local/raycast-extension/src/ingest.ts:34`) → `LINK_QUEUE.send` (`src/cf-worker/ingest/service.ts:76-85`) | same queue path                                                                                                                             | AT RISK — same DLQ fate; gets a false `200 {status:"queued"}` success                                       |
| Public API       | `POST /api/ingest` (`src/cf-worker/index.ts:191`) → `LINK_QUEUE.send`                                                                    | same queue path                                                                                                                             | AT RISK — same DLQ fate; false `200 {status:"queued"}` success                                              |

The split is exactly **livestore-client (local-first) = SAFE** vs.
**queue→DO ingest = AT RISK**. All three at-risk channels share the same single
weak link: `LINK_QUEUE` → `LinkProcessorDO` → `SyncBackendDO`, dead-ending in an
undrained DLQ.

## Recoverability of the lost link

Links have **no D1 representation** — the D1 schema has no `links` table
(`src/cf-worker/db/schema.ts`: user/organization/session/account/member/
invitation/verification/jwks/apikey/invite/app_settings/activity_events only). A
link exists only as a Livestore `linkCreatedV2` event committed inside the DO.

| Possible trace            | Present for the lost link?                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1 `links` row            | No such table — never written                                                                                                                                                        |
| D1 `activity_events`      | Written only on `SyncBackendDO` push (`src/cf-worker/sync/index.ts:91` `recordActivity` in `onPush` → `sync/record-activity.ts:16-49`). Push never happened → no row                 |
| `SyncBackendDO` eventlog  | Never reached                                                                                                                                                                        |
| `LinkProcessorDO` SQLite  | Store never created                                                                                                                                                                  |
| Telegram update re-pull   | No — webhook acked 200, so Telegram dropped the update; `update_id` is gone                                                                                                          |
| DLQ `cloudstash-link-dlq` | The message (url, storeId, source, sourceMeta) lands here, but nothing drains it; expires after retention (~4 days). Recoverable only by manual inspection/replay within that window |
| Worker logs / OTel traces | The URL is logged: `queue-handler.ts:111-117` ("Queue message failed" with `{storeId,url,attempt}`) and Telegram "Links queued". Forensic only, short retention, no replay path      |

**CONFIRMED STILL RECOVERABLE (verified 2026-06-12 via CF GraphQL `queueBacklogAdaptiveGroups`):** the
06-11 link is **physically still in the DLQ**. The analytics show queue
`a50140221e1e479eb128e86ebdcf08e0` (= `cloudstash-link-dlq`) holding
**avg 1 message / ~561 bytes on 2026-06-11** (and the main queue
`e95b9d1a9acb47478fdb23493f0f63eb` at backlog 0). It only reports on 06-11
because an idle, unread queue stops returning adaptive-sampling data — the
message is still resident. **Recovery window: ~4-day queue retention from 06-11
→ expires ~2026-06-15.** To recover (CF-side, requires the human — remote
wrangler/deploy is forbidden for the agent): register an HTTP **pull consumer**
on `cloudstash-link-dlq` (`wrangler queues consumer http add cloudstash-link-dlq`,
no worker deploy needed), pull the message via the Queues pull API, read the
`url`, ack it, and re-ingest (e.g. resend via Telegram now that the backend is
healthy). The `LinkProcessorDO` dedupes by URL (`do-programs.ts:40-53`), so a
manual re-ingest is idempotent.

Net: yesterday's specific link is **recoverable until ~2026-06-15** (still in the
DLQ, confirmed). After that window it's gone — the other traces (logs) are
forensic only with no replay path.

## Telegram webhook-retry consideration (important)

Telegram re-delivers a webhook update only if it does **not** get a 2xx (or the
request times out). We return **200 at enqueue time** (grammy `end()→ok()`),
which tells Telegram the update is handled — so Telegram drops it and will not
redeliver, even though downstream processing later failed. By acking before the
link is durably accepted we **surrender Telegram's built-in at-least-once
redelivery**.

Implication for the fix: do not rely on returning non-2xx to lean on Telegram's
retries — it is coarse (retries a fixed count over a limited window; an all-day
outage exhausts it; it would also re-fire the streaming draft and re-run every
update type). The right shape is **durable capture first, then ack** — own the
retry/replay ourselves and ack Telegram only after the ingest is durably
recorded.

## Design options

The system is already queue-backed (good) — the gap is not "add a buffer," it is
"make the buffer survive a long, account-wide DO outage and guarantee eventual
durable landing + idempotent replay + honest user feedback." Concrete gaps:
**(G1)** `max_retries:3` ≪ outage length → premature dead-lettering;
**(G2)** DLQ has no consumer → never replayed on recovery, expires;
**(G3)** no operator signal on dead-letter;
**(G4)** false success to the user (Telegram draft, `200 {queued}`) with no
eventual failure feedback;
**(G5)** no queryable record of the link outside the DO/SyncBackend.

**Option A — Drain the DLQ + idempotent replay (smallest change).** Add a
consumer for `cloudstash-link-dlq` that re-drives `ingestAndProcess` with long
backoff (or re-enqueues onto the main queue once healthy), plus a dead-letter
alert (reuse the [[todos/admin-server-ahead-alert]] tripwire). Replay is already
safe against double-create: `ingestLink` dedupes by URL
(`do-programs.ts:40-53`, returns `duplicate`). _Pros:_ tiny; uses existing
primitives. _Cons:_ still bounded by DLQ retention (~4 days); doesn't fix
false-success UX or give a queryable record.

**Option B — D1 `pending_ingests` ledger, capture-before-ack (recommended core).**
On every server-side ingest, write the raw ingest (`id`, `url`, `storeId`,
`userId`, `channel`, `sourceMeta`, `receivedAt`, `status='pending'`,
`idempotencyKey`) to a new **D1** table _before_ acking — **D1 is not a DO**, so
it stays writable during an account-wide DO-duration disablement. A cron/worker
drains `pending` rows, calls the DO ingest idempotently, and marks
done/failed; rows persist until materialized (no retention cliff). _Pros:_ a
real, queryable, retention-free record; survives arbitrarily long outages;
natural home for status → enables an admin "stuck ingests" view and honest
deferred user feedback (e.g. a real Telegram reply once materialized). _Cons:_
new table + migration + drainer; some overlap with the queue (could keep the
queue as the fast path and D1 as the durability backstop, or fold them).

**Option C — DO-buffered / "ingest inbox" DO. (rejected as primary.)** Record
the raw URL in a dedicated DO's SQLite on arrival, materialize later. **This does
not help the actual incident:** the account-wide DO-duration cap disables _all_
DOs, so a DO-based inbox is also unavailable at capture time. Non-DO capture
(D1/Queue/KV) is strictly better for this failure mode.

**Option D — Carried idempotency key (pair with A or B).** Generate the
`linkCreatedV2` id / idempotency key at the **edge** (webhook/API handler) and
carry it through the queue/D1 record, so any number of replays yield exactly one
link. Today the id is minted inside the DO (`do-programs.ts:55` `nanoid()`) and
dedupe is URL-based — good, but URL-based dedupe conflates a legitimate re-save
with a replay. A carried key makes replay exactly-once without that conflation.

### Recommended direction

1. **Stopgap (no new infra):** bump `max_retries` and add a retry `delaySeconds`
   so a message survives a multi-hour outage in the main queue. Partial only —
   main-queue retention (~4 days) and max retries/delay caps still bound it.
2. **Short term:** Option A — DLQ consumer with idempotent re-drive + a
   dead-letter alert. Stops the silent loss using existing dedupe.
3. **Durable fix:** Option B + Option D — a D1 `pending_ingests` ledger written
   at the edge before ack, drained by cron, keyed by a carried idempotency key.
   This is the only path that survives an account-wide DO outage (D1 is not a
   DO), survives arbitrarily long outages, and yields a queryable record for an
   admin "stuck/failed ingests" surface and honest user feedback (replace the
   optimistic draft / `{queued}` with a real status or a deferred reply).

Explicitly: do **not** make DO-based capture the primary mechanism (Option C),
and do **not** rely on Telegram redelivery — both fail the exact conditions of
this incident.
