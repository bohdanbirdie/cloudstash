# Admin alerting for stuck LinkProcessorDO sync

## Status

**Detection is wired, alert delivery is not.** Today we log a warning to the worker's console when a stuck LP is detected, but nobody is paged. This doc covers what's left.

## What's in place

The bug that originally motivated this alert ("DO-RPC stream stall") is fixed — see [[../architecture/livestore-do-rpc-stream-stall]]. As a defensive tripwire against future variants, `SyncBackendDO.onPush` already runs a gap detector on every push:

```ts
// src/cf-worker/sync/index.ts
const STUCK_GAP_THRESHOLD = 100;

// In onPush:
const sbMax = currentSyncBackend.getEventlogMax();
if (sbMax !== null && sbMax - firstParent > STUCK_GAP_THRESHOLD) {
  logger.warn("LP push lags SB eventlog — possible stuck client", {
    storeId: maskId(context.storeId),
    lpParent: firstParent,
    sbMax,
    gap: sbMax - firstParent,
  });
}
```

`getEventlogMax` is a method on `SyncBackendDO` that queries `SELECT MAX(seqNum) FROM <eventlog_table>` on the DO's own SQLite (the eventlog table is auto-created by livestore on first push; until then the method returns `null`).

This fires when LP's push references a parent more than 100 events behind SB's eventlog — strong signal that the client lost its catchup events. Normal eventual-consistency rebases produce gaps of 1–30 events; >100 is anomalous.

## What's left — alert delivery

Wire the existing warn log to a Telegram push.

### Recommended: inline POST from `onPush`

The simplest path. Don't introduce a Tail Worker just for this:

1. New env: `ADMIN_TELEGRAM_CHAT_ID`. Capture by DMing the bot once and reading `chat_id` from the first update.
2. Reuse existing `TELEGRAM_BOT_TOKEN`.
3. In the same `if (sbMax - firstParent > STUCK_GAP_THRESHOLD)` block, send to Telegram via `https://api.telegram.org/bot<TOKEN>/sendMessage`. Do not `await` it on the request hot path, but **do** wrap it in `ctx.waitUntil(...)` so CF keeps the DO alive until the fetch resolves — bare fire-and-forget can be aborted when the push handler returns.
4. Dedupe in memory: per-storeId, don't re-fire within a cooldown window (e.g. 5 minutes). The DO's in-memory state survives across pushes inside the same isolate; on eviction we lose state and may re-alert, which is acceptable for a tripwire.

### Alert payload

```
LP sync lag detected

storeId: NpIIlgcN...
LP parent: 3288
SB max: 3462
gap: 174 events
time: 2026-05-16T15:42:41Z
```

User-email enrichment (storeId → email via D1 query) is nice-to-have but adds latency to the alert path. Skip for v1.

### Dedupe semantics

- One alert per stuck-detection event, then cooldown for N minutes per storeId.
- Don't track recovery — keep it simple. If the same storeId re-triggers after cooldown, that's a fresh alert.

## What's out of scope

- **Self-heal action.** The previous shutdown-and-recreate heal was removed because it doesn't actually fix the stall (see "What didn't work" in [[../architecture/livestore-do-rpc-stream-stall]]). Any future heal needs a real strategy, not a placeholder. Start with: alert me, I'll inspect, then we figure out the right action.
- **User-facing UI banner** — separate UX task.
- **Recovery notifications** — nice to have, skip for now.
- **Tail Worker setup** — not needed. We catch the signal cleanly in `onPush`; no need for a separate log-tailing worker.
- **Email fallback** — Telegram only for v1.

## v1 checklist

- [ ] `ADMIN_TELEGRAM_CHAT_ID` env var, captured + added to wrangler secrets
- [ ] Telegram POST in `SyncBackendDO.onPush` when the gap detector fires
- [ ] Per-storeId cooldown to prevent flooding
- [ ] Manual test: rewind an LP head by 150 events via SQL (Recipe A from the postmortem), trigger a push, confirm one Telegram message arrives
- [ ] Manual test: trigger again within cooldown, confirm no duplicate
- [ ] Manual test: wait out cooldown, trigger again, confirm fresh message

## References

- Detection logic: `src/cf-worker/sync/index.ts` (`getEventlogMax`, `STUCK_GAP_THRESHOLD`)
- Reproduction recipe for manual testing: [[../architecture/livestore-do-rpc-stream-stall#reproduction-recipe-a-deterministic]]
- Telegram bot: `TELEGRAM_BOT_TOKEN` already in worker env
